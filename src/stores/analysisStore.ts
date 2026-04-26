import { defineStore } from 'pinia';
import Database from '@tauri-apps/plugin-sql';
import { AnalysisDailyPoint, AnalysisHourlyPoint, AnalysisPage, AnalysisMetricRow } from '../types';

const storageKey = 'clipflow_analysis_pages';

interface CopyAggRow {
  value: string;
  total_copies: number;
  copies_last_7d: number;
  last_copied_at: string;
}

interface DailyAggRow {
  day: string;
  copies: number;
}

interface HourAggRow {
  hour: number;
  copies: number;
}

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    db: null as Database | null,
    pages: [] as AnalysisPage[],
    selectedPageId: '' as string,
  }),

  getters: {
    currentPage(state): AnalysisPage | undefined {
      return state.pages.find((p) => p.id === state.selectedPageId);
    },
  },

  actions: {
    async ensureCopyLogTable() {
      if (!this.db) return;
      await this.db.execute(
        'CREATE TABLE IF NOT EXISTS snippet_copy_logs (id TEXT PRIMARY KEY, page_id TEXT NOT NULL, item_id TEXT, col_idx INTEGER, value TEXT NOT NULL, copied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
      await this.db.execute(
        'CREATE INDEX IF NOT EXISTS idx_snippet_copy_logs_page_time ON snippet_copy_logs(page_id, copied_at DESC)'
      );
    },

    async init() {
      if (!this.db) {
        this.db = await Database.load('sqlite:quicksnap.db');
      }
      await this.ensureCopyLogTable();
      if (this.pages.length === 0) {
        try {
          const raw = localStorage.getItem(storageKey);
          this.pages = raw ? JSON.parse(raw) : [];
          if (this.pages.length > 0 && !this.selectedPageId) {
            this.selectedPageId = this.pages[0].id;
          }
        } catch {
          this.pages = [];
        }
      }
    },

    persistPages() {
      localStorage.setItem(storageKey, JSON.stringify(this.pages));
    },

    selectPage(pageId: string) {
      this.selectedPageId = pageId;
    },

    async queryMetrics(sourcePageId: string): Promise<AnalysisMetricRow[]> {
      if (!this.db) {
        await this.init();
      }
      if (!this.db) return [];
      await this.ensureCopyLogTable();
      let rows: CopyAggRow[] = [];
      try {
        rows = await this.db.select<CopyAggRow[]>(
          `SELECT 
            value,
            COUNT(*) AS total_copies,
            SUM(CASE WHEN copied_at >= datetime('now','localtime','-7 days') THEN 1 ELSE 0 END) AS copies_last_7d,
            MAX(copied_at) AS last_copied_at
          FROM snippet_copy_logs
          WHERE page_id = $1
          GROUP BY value
          ORDER BY total_copies DESC`,
          [sourcePageId]
        );
      } catch (e) {
        const msg = String(e || '');
        if (msg.includes('no such table')) {
          await this.ensureCopyLogTable();
          rows = [];
        } else {
          throw e;
        }
      }

      return rows.map((r) => ({
        value: r.value,
        totalCopies: Number(r.total_copies || 0),
        copiesLast7Days: Number(r.copies_last_7d || 0),
        avgCopiesPerDay7Days: Number((Number(r.copies_last_7d || 0) / 7).toFixed(2)),
        lastCopiedAt: r.last_copied_at || '',
      }));
    },

    async generateFromSnippetPage(sourcePageId: string, sourcePageName: string) {
      const metrics = await this.queryMetrics(sourcePageId);
      const dailyTrend14d = await this.queryDailyTrend14d(sourcePageId);
      const hourlyDistribution = await this.queryHourlyDistribution(sourcePageId);
      const id = `analysis-${sourcePageId}`;
      const page: AnalysisPage = {
        id,
        sourcePageId,
        sourcePageName,
        name: `${sourcePageName}-数据分析`,
        generatedAt: new Date().toISOString(),
        rows: metrics,
        dailyTrend14d,
        hourlyDistribution,
      };

      const idx = this.pages.findIndex((p) => p.id === id);
      if (idx > -1) this.pages[idx] = page;
      else this.pages.unshift(page);

      this.selectedPageId = id;
      this.persistPages();
    },

    async refreshCurrentPage() {
      const page = this.currentPage;
      if (!page) return;
      const sourceName = page.sourcePageName || page.name.replace(/-数据分析$/, '');
      await this.generateFromSnippetPage(page.sourcePageId, sourceName);
    },

    async queryDailyTrend14d(sourcePageId: string): Promise<AnalysisDailyPoint[]> {
      if (!this.db) return [];
      const raw = await this.db.select<DailyAggRow[]>(
        `SELECT 
          date(copied_at) AS day,
          COUNT(*) AS copies
        FROM snippet_copy_logs
        WHERE page_id = $1
          AND copied_at >= datetime('now','-13 days')
        GROUP BY date(copied_at)
        ORDER BY day ASC`,
        [sourcePageId]
      );

      const map = new Map(raw.map((r) => [r.day, Number(r.copies || 0)]));
      const points: AnalysisDailyPoint[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        points.push({ date: key, copies: map.get(key) || 0 });
      }
      return points;
    },

    async queryHourlyDistribution(sourcePageId: string): Promise<AnalysisHourlyPoint[]> {
      if (!this.db) return [];
      const raw = await this.db.select<HourAggRow[]>(
        `SELECT 
          CAST(strftime('%H', copied_at) AS INTEGER) AS hour,
          COUNT(*) AS copies
        FROM snippet_copy_logs
        WHERE page_id = $1
        GROUP BY strftime('%H', copied_at)
        ORDER BY hour ASC`,
        [sourcePageId]
      );
      const map = new Map(raw.map((r) => [Number(r.hour), Number(r.copies || 0)]));
      const points: AnalysisHourlyPoint[] = [];
      for (let h = 0; h < 24; h++) {
        points.push({ hour: h, copies: map.get(h) || 0 });
      }
      return points;
    },
  },
});
