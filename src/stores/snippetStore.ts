import { defineStore } from 'pinia';
import Database from '@tauri-apps/plugin-sql';
import { SnippetPage, SnippetItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { message } from '@tauri-apps/plugin-dialog';

export const useSnippetStore = defineStore('snippets', {
    state: () => ({
        db: null as Database | null,
        pages: [] as SnippetPage[],
        selectedPageId: '' as string,
        items: [] as SnippetItem[],
        unlockedPages: new Set<string>(),

        hiddenCols: JSON.parse(localStorage.getItem('clipflow_hiddenCols') || '{}') as Record<string, number[]>,
        hiddenRows: JSON.parse(localStorage.getItem('clipflow_hiddenRows') || '[]') as string[],
    }),

    getters: {
        currentPageName(state): string {
            if (!state.selectedPageId) return 'Snippets';
            const page = state.pages.find(p => p.id === state.selectedPageId);
            return page ? page.name : 'Unknown';
        },
        currentSelectedPage(state): SnippetPage | undefined {
            return state.pages.find(p => p.id === state.selectedPageId);
        },
        isCurrentPageLocked(state): boolean {
            const page = this.currentSelectedPage;
            if (!page || !page.password) return false;
            return !state.unlockedPages.has(page.id);
        }
    },

    actions: {
        async init() {
            try {
                if (!this.db) {
                    this.db = await Database.load('sqlite:quicksnap.db');
                    console.log('[SnippetStore] DB loaded');
                }
            } catch (e) {
                console.error('[SnippetStore] Failed to load DB:', e);
                return;
            }
            await this.loadPages();
            if (this.pages.length > 0 && !this.selectedPageId) {
                this.selectedPageId = this.pages[0].id;
            }
            if (this.selectedPageId) {
                await this.refreshItems();
            }
        },

        // ===== Pages =====
        async loadPages() {
            if (!this.db) return;
            this.pages = await this.db.select<SnippetPage[]>('SELECT * FROM snippet_pages ORDER BY rank ASC');
        },

        async createPage(name: string, cols: number = 3, rows: number = 2) {
            if (!this.db || !name.trim()) return;
            const id = uuidv4();
            const rank = this.pages.length;

            const headers = Array.from({ length: cols }, (_, i) => `字段 ${i + 1}`);
            const headersJson = JSON.stringify(headers);

            await this.db.execute(
                'INSERT INTO snippet_pages (id, name, rank, headers, created_at) VALUES ($1, $2, $3, $4, datetime("now","localtime"))',
                [id, name.trim(), rank, headersJson]
            );

            if (rows > 0) {
                const emptyData = JSON.stringify(Array(cols).fill(''));
                for (let i = 0; i < rows; i++) {
                    const itemId = uuidv4();
                    await this.db.execute(
                        'INSERT INTO snippet_items (id, page_id, data, rank, created_at) VALUES ($1, $2, $3, $4, datetime("now","localtime"))',
                        [itemId, id, emptyData, i]
                    );
                }
            }

            await this.loadPages();
            this.selectedPageId = id;
            await this.refreshItems();
        },

        async renamePage(id: string, newName: string) {
            if (!this.db || !newName.trim()) return;
            await this.db.execute(
                'UPDATE snippet_pages SET name = $1 WHERE id = $2',
                [newName.trim(), id]
            );
            await this.loadPages();
        },

        async updatePageHeaders(id: string, headers: string[]) {
            if (!this.db) return;
            const jsonStr = JSON.stringify(headers);
            try {
                const res = await this.db.execute(
                    'UPDATE snippet_pages SET headers = $1 WHERE id = $2',
                    [jsonStr, id]
                );
                if (res.rowsAffected === 0) {
                    await message(`No rows were updated in DB. Page ID: ${id}`, { title: 'Error', kind: 'error' });
                }
            } catch (err: any) {
                await message(`Failed to save headers: ${err.message || String(err)}`, { title: 'Error', kind: 'error' });
            }
            await this.loadPages();
        },

        async setPagePassword(id: string, password: string | null) {
            if (!this.db) return;
            await this.db.execute(
                'UPDATE snippet_pages SET password = $1 WHERE id = $2',
                [password, id]
            );
            await this.loadPages();
            
            // 只要修改了密码，就立刻移除其解锁状态，强制回到锁屏界面
            this.unlockedPages.delete(id);
        },

        unlockPage(id: string, passwordAttempt: string): boolean {
            const page = this.pages.find(p => p.id === id);
            if (!page || !page.password) return true;
            if (page.password === passwordAttempt) {
                this.unlockedPages.add(id);
                return true;
            }
            return false;
        },

        async deletePage(id: string) {
            if (!this.db) return;
            await this.db.execute('DELETE FROM snippet_items WHERE page_id = $1', [id]);
            await this.db.execute('DELETE FROM snippet_pages WHERE id = $1', [id]);

            if (this.hiddenCols[id]) {
                delete this.hiddenCols[id];
                localStorage.setItem('clipflow_hiddenCols', JSON.stringify(this.hiddenCols));
            }

            await this.loadPages();
            if (this.selectedPageId === id) {
                this.selectedPageId = this.pages.length > 0 ? this.pages[0].id : '';
                await this.refreshItems();
            } else if (this.selectedPageId) { // Keep original logic for refreshing if another page is selected
                await this.refreshItems();
            } else { // Keep original logic for clearing items if no page is selected
                this.items = [];
            }
        },

        async selectPage(pageId: string) {
            if (this.selectedPageId === pageId) return;
            this.selectedPageId = pageId;
            await this.refreshItems();
        },

        // ===== Items =====
        async refreshItems() {
            if (!this.db || !this.selectedPageId) {
                this.items = [];
                return;
            }
            this.items = await this.db.select<SnippetItem[]>(
                'SELECT * FROM snippet_items WHERE page_id = $1 ORDER BY rank ASC, created_at ASC',
                [this.selectedPageId]
            );
        },

        async addItem(data: string[]) {
            if (!this.db || !this.selectedPageId) return;
            const id = uuidv4();
            const rank = this.items.length;
            const jsonStr = JSON.stringify(data);

            await this.db.execute(
                'INSERT INTO snippet_items (id, page_id, data, rank, created_at) VALUES ($1, $2, $3, $4, datetime("now","localtime"))',
                [id, this.selectedPageId, jsonStr, rank]
            );
            await this.refreshItems();
        },

        async updateItem(id: string, data: string[]) {
            if (!this.db) return;
            const jsonStr = JSON.stringify(data);
            await this.db.execute(
                'UPDATE snippet_items SET data = $1 WHERE id = $2',
                [jsonStr, id]
            );
            await this.refreshItems();
        },

        async deleteItem(id: string) {
            if (!this.db) return;
            await this.db.execute('DELETE FROM snippet_items WHERE id = $1', [id]);

            const hIdx = this.hiddenRows.indexOf(id);
            if (hIdx > -1) {
                this.hiddenRows.splice(hIdx, 1);
                localStorage.setItem('clipflow_hiddenRows', JSON.stringify(this.hiddenRows));
            }

            await this.refreshItems();
        },

        async copyText(text: string) {
            try {
                if (text) {
                    await writeText(text);
                }
            } catch (e) {
                console.error('Failed to copy snippet:', e);
            }
        },

        toggleHiddenCol(pageId: string, colIdx: number) {
            if (!this.hiddenCols[pageId]) {
                this.hiddenCols[pageId] = [];
            }
            const arr = this.hiddenCols[pageId];
            const idx = arr.indexOf(colIdx);
            if (idx > -1) arr.splice(idx, 1);
            else arr.push(colIdx);
            localStorage.setItem('clipflow_hiddenCols', JSON.stringify(this.hiddenCols));
        },

        toggleHiddenRow(rowId: string) {
            const idx = this.hiddenRows.indexOf(rowId);
            if (idx > -1) this.hiddenRows.splice(idx, 1);
            else this.hiddenRows.push(rowId);
            localStorage.setItem('clipflow_hiddenRows', JSON.stringify(this.hiddenRows));
        }
    }
});
