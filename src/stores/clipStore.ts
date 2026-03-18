import { defineStore } from 'pinia';
import Database from '@tauri-apps/plugin-sql';
import { Clip, Page } from '../types';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

// Module-level variables to survive Pinia state hydration/serialization issues
// and to facilitate HMR cleanup.
let globalUnlisten: UnlistenFn | null = null;
let lastAddContent = '';
let lastAddTimestamp = 0;

export const useClipStore = defineStore('clips', {
    state: () => ({
        db: null as Database | null,
        clips: [] as Clip[],
        pages: [] as Page[],
        selectedPageId: 'inbox',
        capturePageId: localStorage.getItem('quicksnap-capture-page') || 'inbox',
        searchQuery: '',
        selectedType: 'all' as 'all' | 'text' | 'image' | 'file',
    }),

    getters: {
        currentPageName(state): string {
            if (state.selectedPageId === 'inbox') return 'Inbox';
            const page = state.pages.find(p => p.id === state.selectedPageId);
            return page ? page.name : 'Unknown';
        },
    },

    actions: {
        async init() {
            try {
                if (!this.db) {
                    this.db = await Database.load('sqlite:quicksnap.db');
                    console.log('[ClipStore] DB loaded');
                }
            } catch (e) {
                console.error('[ClipStore] Failed to load DB:', e);
                return;
            }
            await this.loadPages();
            console.log('[ClipStore] Pages loaded:', this.pages.length);

            // 一次性迁移：将旧的 UTC 时间戳转换为本地时间（+8小时）
            const migrated = localStorage.getItem('quicksnap-tz-migrated');
            if (!migrated) {
                try {
                    await this.db.execute(
                        "UPDATE clips SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL"
                    );
                    localStorage.setItem('quicksnap-tz-migrated', '1');
                    console.log('[ClipStore] Migrated timestamps from UTC to local time');
                } catch (e) {
                    console.error('[ClipStore] Timestamp migration failed:', e);
                }
            }

            await this.refreshClips();
            console.log('[ClipStore] Initial clips loaded:', this.clips.length);

            // 启动时自动执行历史保留策略
            await this.applyHistoryRetention();
        },

        async startListener() {
            if (globalUnlisten) {
                console.log('[ClipStore] Listener already running, restarting...');
                globalUnlisten();
                globalUnlisten = null;
            }

            const store = this;
            globalUnlisten = await listen('clipboard-changed', async (event: any) => {
                const payload = event.payload;
                console.log('[ClipStore] Clipboard event received:', payload);
                await store.addClip(payload.content_type, payload.content);
            });
            console.log('[ClipStore] Clipboard listener started');
        },

        async stopListener() {
            if (globalUnlisten) {
                globalUnlisten();
                globalUnlisten = null;
                console.log('[ClipStore] Clipboard listener stopped');
            }
        },

        // 应用历史保留策略（启动时自动调用）
        async applyHistoryRetention() {
            const mode = parseInt(localStorage.getItem('quicksnap-keep-history') || '30');
            if (mode === 36500) {
                console.log('[ClipStore] History retention: forever, skipping cleanup');
                return;
            }

            let cutoffDate: Date;
            if (mode === -1) {
                const saved = localStorage.getItem('quicksnap-custom-delete-date');
                if (!saved) return;
                cutoffDate = new Date(saved);
            } else {
                cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - mode);
            }

            // 使用本地时间格式（与 SQLite datetime('now','localtime') 一致）
            const dateStr = this.formatLocalDate(cutoffDate);
            console.log(`[ClipStore] Auto-cleanup: deleting unpinned clips before ${dateStr}`);
            await this.deleteClipsBefore(dateStr);
        },

        // 格式化为本地时间字符串 YYYY-MM-DD HH:MM:SS
        formatLocalDate(d: Date): string {
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        },

        // ===== Pages =====
        async loadPages() {
            if (!this.db) return;
            this.pages = await this.db.select<Page[]>('SELECT * FROM pages ORDER BY rank ASC');
        },

        async createPage(name: string) {
            if (!this.db || !name.trim()) return;
            const id = uuidv4();
            const rank = this.pages.length;
            await this.db.execute(
                'INSERT INTO pages (id, name, rank, is_system) VALUES ($1, $2, $3, 0)',
                [id, name.trim(), rank]
            );
            await this.loadPages();
            this.selectedPageId = id;
            await this.refreshClips();
        },

        async renamePage(id: string, newName: string) {
            if (!this.db || !newName.trim()) return;
            await this.db.execute(
                'UPDATE pages SET name = $1 WHERE id = $2',
                [newName.trim(), id]
            );
            await this.loadPages();
        },

        async deletePage(id: string) {
            if (!this.db || id === 'inbox') return; // 不能删除 Inbox
            // 先删除该页面的所有 clips
            await this.db.execute('DELETE FROM clips WHERE page_id = $1', [id]);
            await this.db.execute('DELETE FROM pages WHERE id = $1', [id]);
            if (this.selectedPageId === id) {
                this.selectedPageId = 'inbox';
            }
            await this.loadPages();
            await this.refreshClips();
        },

        async deleteAllClipsInPage(pageId: string) {
            if (!this.db) return;
            // 获取该页面的所有包含文件的片段，用于删除底层实体文件
            const clips = await this.db.select<Clip[]>('SELECT * FROM clips WHERE page_id = $1', [pageId]);
            const { invoke } = await import('@tauri-apps/api/core');
            for (const clip of clips) {
                if (clip.type === 'image' || clip.type === 'file') {
                    try { await invoke('delete_file', { path: clip.content }); } catch (e) { }
                }
            }
            await this.db.execute('DELETE FROM clips WHERE page_id = $1', [pageId]);
            await this.refreshClips();
        },

        // ===== Clips =====
        async refreshClips() {
            if (!this.db) return;
            let query = 'SELECT * FROM clips WHERE page_id = $1';
            const params: any[] = [this.selectedPageId];
            let paramIdx = 2;

            if (this.selectedType !== 'all') {
                query += ` AND type = $${paramIdx}`;
                params.push(this.selectedType);
                paramIdx++;
            }

            if (this.searchQuery.trim()) {
                query += ` AND content LIKE $${paramIdx}`;
                params.push(`%${this.searchQuery.trim()}%`);
                paramIdx++;
            }

            query += ' ORDER BY is_pinned DESC, created_at DESC';
            this.clips = await this.db.select<Clip[]>(query, params);
        },

        // 内存中去重（短时间内避免重复插入）
        async addClip(type: string, content: string) {
            if (!this.db) return;

            // 1. 内存去重：1秒内相同内容直接忽略
            const now = Date.now();
            if (content === lastAddContent && (now - lastAddTimestamp < 1000)) {
                console.log('[ClipStore] Skipping duplicate add (debounce)');
                return;
            }
            lastAddContent = content;
            lastAddTimestamp = now;

            // 2. 数据库去重：检查最近是否已有相同内容
            const recent = await this.db.select<Clip[]>(
                'SELECT id FROM clips WHERE content = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
                [content, type]
            );
            if (recent.length > 0) return;

            const id = uuidv4();
            const title = type === 'text'
                ? content.substring(0, 50)
                : content.split('/').pop() || 'Clip';

            try {
                await this.db.execute(
                    'INSERT INTO clips (id, type, content, page_id, title, created_at) VALUES ($1, $2, $3, $4, $5, datetime("now","localtime"))',
                    [id, type, content, this.capturePageId, title]
                );
                await this.refreshClips();

                // 自动清理：每次新增记录时执行历史保留策略
                await this.applyHistoryRetention();
            } catch (e) {
                console.error('Failed to add clip:', e);
            }
        },

        async deleteClip(id: string) {
            if (!this.db) return;
            // Get content (path) before deleting
            const clip = this.clips.find(c => c.id === id);
            if (clip && (clip.type === 'image' || clip.type === 'file')) {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('delete_file', { path: clip.content });
                } catch (e) {
                    console.error('[ClipStore] Failed to delete file:', e);
                }
            }

            await this.db.execute('DELETE FROM clips WHERE id = $1', [id]);
            await this.refreshClips();
        },

        async togglePin(id: string) {
            if (!this.db) return;
            const clip = this.clips.find(c => c.id === id);
            if (!clip) return;
            const newVal = clip.is_pinned ? 0 : 1;
            await this.db.execute(
                'UPDATE clips SET is_pinned = $1 WHERE id = $2',
                [newVal, id]
            );
            await this.refreshClips();
        },

        async copyToClipboard(clip: Clip) {
            try {
                if (clip.type === 'image') {
                    // 图片类型：将图片数据写入剪贴板（而非路径）
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('copy_image_to_clipboard', { imagePath: clip.content });
                } else {
                    // 文本/文件类型：复制文本内容或文件路径
                    await writeText(clip.content);
                }
            } catch (e) {
                console.error('Failed to copy to clipboard:', e);
            }
        },

        async moveClipToPage(clipId: string, pageId: string) {
            if (!this.db) return;
            await this.db.execute(
                'UPDATE clips SET page_id = $1 WHERE id = $2',
                [pageId, clipId]
            );
            await this.refreshClips();
        },

        async selectPage(pageId: string) {
            this.selectedPageId = pageId;
            this.searchQuery = '';
            this.selectedType = 'all';
            await this.refreshClips();
        },

        async setTypeFilter(type: 'all' | 'text' | 'image' | 'file') {
            this.selectedType = type;
            await this.refreshClips();
        },

        setCapturePageId(pageId: string) {
            this.capturePageId = pageId;
            localStorage.setItem('quicksnap-capture-page', pageId);
        },

        async search(query: string) {
            this.searchQuery = query;
            await this.refreshClips();
        },

        async clearAllClips() {
            if (!this.db) return;
            // Get all clips in page to delete files
            const clips = await this.db.select<Clip[]>('SELECT * FROM clips WHERE page_id = $1', [this.selectedPageId]);
            const { invoke } = await import('@tauri-apps/api/core');
            for (const clip of clips) {
                if (clip.type === 'image' || clip.type === 'file') {
                    try { await invoke('delete_file', { path: clip.content }); } catch (e) { }
                }
            }

            await this.db.execute('DELETE FROM clips WHERE page_id = $1', [this.selectedPageId]);
            await this.refreshClips();
        },

        // 清空所有页面的所有 clips
        async clearAllClipsGlobal() {
            if (!this.db) return;
            // Get all clips to delete files
            const clips = await this.db.select<Clip[]>('SELECT * FROM clips');
            const { invoke } = await import('@tauri-apps/api/core');
            for (const clip of clips) {
                if (clip.type === 'image' || clip.type === 'file') {
                    try { await invoke('delete_file', { path: clip.content }); } catch (e) { }
                }
            }

            await this.db.execute('DELETE FROM clips');
            await this.refreshClips();
        },

        // 删除指定日期之前的 clips（历史保留策略）
        async deleteClipsBefore(dateStr: string) {
            if (!this.db) return 0;
            console.log(`[ClipStore] Deleting clips before: ${dateStr}`);

            // Fetch clips to be deleted first
            const toDelete = await this.db.select<Clip[]>(
                'SELECT * FROM clips WHERE created_at < $1 AND is_pinned = 0',
                [dateStr]
            );

            if (toDelete.length > 0) {
                const { invoke } = await import('@tauri-apps/api/core');
                for (const clip of toDelete) {
                    if (clip.type === 'image' || clip.type === 'file') {
                        try { await invoke('delete_file', { path: clip.content }); } catch (e) {
                            console.error('[ClipStore] Failed to delete file during cleanup:', e);
                        }
                    }
                }
            }

            const result = await this.db.execute(
                'DELETE FROM clips WHERE created_at < $1 AND is_pinned = 0',
                [dateStr]
            );
            console.log(`[ClipStore] Deleted ${result.rowsAffected} clips`);
            await this.refreshClips();
            return result.rowsAffected;
        },
    }
});
