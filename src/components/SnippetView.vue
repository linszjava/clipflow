<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSnippetStore } from '../stores/snippetStore';
import { storeToRefs } from 'pinia';
import * as XLSX from 'xlsx';

const snippetStore = useSnippetStore();
const { items, currentPageName } = storeToRefs(snippetStore);

const currentHeaders = computed<string[]>(() => {
    const page = snippetStore.pages.find(p => p.id === snippetStore.selectedPageId);
    if (page && page.headers) {
        try {
            return JSON.parse(page.headers);
        } catch(e) { }
    }
    return ['账号 (Account)', '密码 (Password)', '备注 (Notes)'];
});

const newItem = ref<string[]>([]);
const showNewRow = ref(false);
const excelFileInput = ref<HTMLInputElement | null>(null);

const localHeaders = ref<string[]>([]);
const colWidths = ref<number[]>([]);
const colWidthStorageKey = 'clipflow_colWidths';
const draggingColIndex = ref<number | null>(null);
const draggingRowIndex = ref<number | null>(null);

const getStoredColWidths = (): Record<string, number[]> => {
    try {
        return JSON.parse(localStorage.getItem(colWidthStorageKey) || '{}');
    } catch {
        return {};
    }
};

const savePageColWidths = () => {
    const pageId = snippetStore.selectedPageId;
    if (!pageId) return;
    const all = getStoredColWidths();
    all[pageId] = [...colWidths.value];
    localStorage.setItem(colWidthStorageKey, JSON.stringify(all));
};

const initColWidthsForPage = () => {
    const pageId = snippetStore.selectedPageId;
    if (!pageId) {
        colWidths.value = [];
        return;
    }
    const all = getStoredColWidths();
    const stored = all[pageId] || [];
    const targetLen = localHeaders.value.length;
    const minWidth = 120;
    const next = Array(targetLen).fill(180).map((_, idx) => {
        const w = stored[idx];
        return typeof w === 'number' && w >= minWidth ? w : 180;
    });
    colWidths.value = next;
    savePageColWidths();
};

const isColHidden = (idx: number) => {
    return snippetStore.hiddenCols[snippetStore.selectedPageId]?.includes(idx) ?? false;
};

const isRowHidden = (id: string) => {
    return snippetStore.hiddenRows.includes(id);
};

const isHidden = (rowId: string, colIdx: number) => {
    return isColHidden(colIdx) || isRowHidden(rowId);
};

const toggleCol = (idx: number) => {
    snippetStore.toggleHiddenCol(snippetStore.selectedPageId, idx);
};

const toggleRow = (id: string) => {
    snippetStore.toggleHiddenRow(id);
};

watch(() => currentHeaders.value, (newVal) => {
    localHeaders.value = [...newVal];
    newItem.value = Array(newVal.length).fill('');
    initColWidthsForPage();
}, { immediate: true, deep: true });

import { ask, message } from '@tauri-apps/plugin-dialog';

const saveHeaders = async () => {
    try {
        await snippetStore.updatePageHeaders(snippetStore.selectedPageId, localHeaders.value);
        console.log('Headers saved successfully');
    } catch (e: any) {
        await message(`Save failed: ${e.message}`, { title: 'Error', kind: 'error' });
    }
};

const reindexHiddenColsAfterDelete = (deletedIdx: number) => {
    const pageId = snippetStore.selectedPageId;
    if (!pageId) return;
    const hidden = snippetStore.hiddenCols[pageId] || [];
    const next = hidden
        .filter(i => i !== deletedIdx)
        .map(i => (i > deletedIdx ? i - 1 : i));
    snippetStore.hiddenCols[pageId] = next;
    localStorage.setItem('clipflow_hiddenCols', JSON.stringify(snippetStore.hiddenCols));
};

const reindexHiddenColsAfterReorder = (from: number, to: number) => {
    const pageId = snippetStore.selectedPageId;
    if (!pageId) return;
    const hidden = snippetStore.hiddenCols[pageId] || [];
    const mapped = hidden.map((idx) => {
        if (idx === from) return to;
        if (from < to && idx > from && idx <= to) return idx - 1;
        if (from > to && idx >= to && idx < from) return idx + 1;
        return idx;
    });
    snippetStore.hiddenCols[pageId] = Array.from(new Set(mapped)).sort((a, b) => a - b);
    localStorage.setItem('clipflow_hiddenCols', JSON.stringify(snippetStore.hiddenCols));
};

const moveArrayItem = <T>(arr: T[], from: number, to: number): T[] => {
    const next = [...arr];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    return next;
};

const deleteColumn = async (colIndex: number) => {
    if (!snippetStore.selectedPageId) return;
    if (localHeaders.value.length <= 1) {
        await message('至少需要保留一列', { title: '提示', kind: 'warning' });
        return;
    }

    try {
        const nextHeaders = [...localHeaders.value];
        nextHeaders.splice(colIndex, 1);
        await snippetStore.updatePageHeaders(snippetStore.selectedPageId, nextHeaders);

        for (const item of items.value) {
            const row = parseData(item.data);
            row.splice(colIndex, 1);
            await snippetStore.updateItem(item.id, row);
        }

        localHeaders.value = nextHeaders;
        newItem.value = nextHeaders.map((_, idx) => newItem.value[idx] || '');
        colWidths.value.splice(colIndex, 1);
        reindexHiddenColsAfterDelete(colIndex);
        savePageColWidths();
    } catch (e: any) {
        await message(`删除列失败: ${e.message || String(e)}`, { title: 'Error', kind: 'error' });
    }
};

const addColumn = async () => {
    if (!snippetStore.selectedPageId) return;
    const nextHeader = `字段 ${localHeaders.value.length + 1}`;
    const nextHeaders = [...localHeaders.value, nextHeader];
    try {
        await snippetStore.updatePageHeaders(snippetStore.selectedPageId, nextHeaders);

        for (const item of items.value) {
            const row = parseData(item.data);
            row.push('');
            await snippetStore.updateItem(item.id, row);
        }

        localHeaders.value = nextHeaders;
        newItem.value = [...newItem.value, ''];
        colWidths.value = [...colWidths.value, 180];
        savePageColWidths();
    } catch (e: any) {
        await message(`新增列失败: ${e.message || String(e)}`, { title: 'Error', kind: 'error' });
    }
};

const reorderColumns = async (from: number, to: number) => {
    if (!snippetStore.selectedPageId) return;
    if (from === to) return;
    try {
        const nextHeaders = moveArrayItem(localHeaders.value, from, to);
        await snippetStore.updatePageHeaders(snippetStore.selectedPageId, nextHeaders);

        for (const item of items.value) {
            const row = parseData(item.data);
            const nextRow = moveArrayItem(row, from, to);
            await snippetStore.updateItem(item.id, nextRow);
        }

        localHeaders.value = nextHeaders;
        colWidths.value = moveArrayItem(colWidths.value, from, to);
        newItem.value = moveArrayItem(newItem.value, from, to);
        reindexHiddenColsAfterReorder(from, to);
        savePageColWidths();
    } catch (e: any) {
        await message(`调整列顺序失败: ${e.message || String(e)}`, { title: 'Error', kind: 'error' });
    }
};

const onColDragStart = (idx: number, e: DragEvent) => {
    draggingColIndex.value = idx;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
    }
};

const onColDrop = async (targetIdx: number) => {
    if (draggingColIndex.value === null) return;
    const from = draggingColIndex.value;
    draggingColIndex.value = null;
    await reorderColumns(from, targetIdx);
};

const onColDragEnd = () => {
    draggingColIndex.value = null;
};

const reorderRows = async (from: number, to: number) => {
    if (from === to) return;
    const orderedIds = items.value.map(item => item.id);
    const [moved] = orderedIds.splice(from, 1);
    orderedIds.splice(to, 0, moved);
    await snippetStore.reorderItemRanks(orderedIds);
};

const onRowDragStart = (idx: number, e: DragEvent) => {
    draggingRowIndex.value = idx;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
    }
};

const onRowDrop = async (targetIdx: number) => {
    if (draggingRowIndex.value === null) return;
    const from = draggingRowIndex.value;
    draggingRowIndex.value = null;
    await reorderRows(from, targetIdx);
};

const onRowDragEnd = () => {
    draggingRowIndex.value = null;
};

onMounted(async () => {
    if (!snippetStore.db) {
        await snippetStore.init();
    }
});

const addNewItem = async () => {
    if (newItem.value.every(v => !v.trim())) {
        showNewRow.value = false;
        return;
    }
    await snippetStore.addItem([...newItem.value]);
    newItem.value = Array(currentHeaders.value.length).fill('');
    showNewRow.value = false;
};

const updateItem = async (id: string, idx: number, val: string) => {
    const item = items.value.find(i => i.id === id);
    if (!item) return;
    try {
        const dataArr = JSON.parse(item.data);
        dataArr[idx] = val;
        await snippetStore.updateItem(id, dataArr);
    } catch(e) {
        console.error('Failed to update snippet item', e);
    }
};

const deleteItem = async (id: string) => {
    await snippetStore.deleteItem(id);
};

const copyValue = async (itemId: string, colIdx: number, val: string) => {
    await snippetStore.copyCellValue(itemId, colIdx, val);
};

const exportExcel = () => {
    const headers = [...localHeaders.value];
    const rows = items.value.map(item => parseData(item.data));
    const sheetData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const safeName = (currentPageName.value || 'snippet-page').replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(workbook, `${safeName}.xlsx`);
};

const openImportExcelPicker = () => {
    excelFileInput.value?.click();
};

const hasNonEmptyExistingData = () => {
    return items.value.some((item) => {
        const row = parseData(item.data);
        return row.some((cell) => String(cell ?? '').trim().length > 0);
    });
};

const importExcel = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
        if (hasNonEmptyExistingData()) {
            const confirmed = await ask(
                `当前页面存在已填写内容，导入将覆盖现有数据，是否继续？`,
                {
                    title: '确认覆盖导入',
                    kind: 'warning',
                    okLabel: '继续导入',
                    cancelLabel: '取消',
                }
            );
            if (!confirmed) {
                await message('已取消导入', { title: '提示', kind: 'info' });
                return;
            }
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            await message('Excel 文件为空', { title: '提示', kind: 'warning' });
            return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
            header: 1,
            defval: '',
            blankrows: false,
        });

        if (aoa.length === 0) {
            await message('Excel 文件没有可导入内容', { title: '提示', kind: 'warning' });
            return;
        }

        const rawHeaders = aoa[0].map(v => String(v ?? '').trim());
        const colCount = Math.max(1, rawHeaders.length);
        const headers = Array(colCount).fill('').map((_, idx) => rawHeaders[idx] || `字段 ${idx + 1}`);
        const rows = aoa.slice(1).map(row =>
            Array(colCount).fill('').map((_, idx) => String(row[idx] ?? ''))
        );

        await snippetStore.replacePageData(headers, rows);
        localHeaders.value = [...headers];
        newItem.value = Array(headers.length).fill('');
        await message(`已导入 ${rows.length} 行数据`, { title: '导入成功', kind: 'info' });
    } catch (e: any) {
        await message(`导入失败: ${e.message || String(e)}`, { title: 'Error', kind: 'error' });
    } finally {
        input.value = '';
    }
};

const parseData = (jsonStr: string) => {
    const cols = currentHeaders.value.length;
    try {
        const arr = JSON.parse(jsonStr);
        // Ensure it's an array of cols length
        const result = Array(cols).fill('');
        for (let i = 0; i < Math.min(arr.length, cols); i++) {
            result[i] = arr[i] || '';
        }
        return result;
    } catch {
        return Array(cols).fill('');
    }
};

const getColLabel = (index: number): string => {
    let n = index + 1;
    let label = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        label = String.fromCharCode(65 + rem) + label;
        n = Math.floor((n - 1) / 26);
    }
    return label;
};

const handleInputClick = (e: MouseEvent) => {
    // Select all text on click for easier editing
    (e.target as HTMLInputElement).select();
};

const unlockPasswordInput = ref('');
const unlockError = ref(false);

const handleUnlock = () => {
    const success = snippetStore.unlockPage(snippetStore.selectedPageId, unlockPasswordInput.value);
    if (success) {
        unlockPasswordInput.value = '';
        unlockError.value = false;
    } else {
        unlockError.value = true;
        setTimeout(() => unlockError.value = false, 3000);
    }
};

watch(() => snippetStore.selectedPageId, () => {
    unlockPasswordInput.value = '';
    unlockError.value = false;
    initColWidthsForPage();
});

const startResize = (colIndex: number, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const minWidth = 120;
    const startX = e.clientX;
    const startWidth = colWidths.value[colIndex] || 180;

    const onMouseMove = (evt: MouseEvent) => {
        const delta = evt.clientX - startX;
        const nextWidth = Math.max(minWidth, startWidth + delta);
        colWidths.value[colIndex] = nextWidth;
    };

    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        savePageColWidths();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
};
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-zinc-50/50">
    <!-- Header -->
    <header class="h-14 border-b border-zinc-200/50 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 z-10 shrink-0 shadow-[0_1px_3px_rgb(0,0,0,0.02)]">
      <div class="flex items-center gap-3">
        <div class="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </div>
        <h2 class="font-bold text-zinc-800 text-base tracking-tight">{{ currentPageName }}</h2>
      </div>
      
      <div class="flex items-center gap-4">
          <button
            v-if="!snippetStore.isCurrentPageLocked"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition"
            @click="openImportExcelPicker"
          >
            导入 Excel
          </button>
          <button
            v-if="!snippetStore.isCurrentPageLocked"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition"
            @click="exportExcel"
          >
            导出 Excel
          </button>
          <button
            v-if="!snippetStore.isCurrentPageLocked"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition"
            @click="addColumn"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            新增一列
          </button>
          <button 
            v-if="!snippetStore.isCurrentPageLocked"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
            @click="showNewRow = true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            新增一行
          </button>
      </div>
    </header>
    <input
      ref="excelFileInput"
      type="file"
      accept=".xlsx,.xls"
      class="hidden"
      @change="importExcel"
    />

    <!-- Locked Screen -->
    <div v-if="snippetStore.isCurrentPageLocked" class="flex-1 flex flex-col items-center justify-center p-6 select-none bg-zinc-50/50">
        <div class="w-80 bg-white rounded-2xl shadow-xl border border-zinc-200/60 p-8 flex flex-col items-center text-center transform transition-all">
            <div class="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-5 shadow-inner border border-indigo-100/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3 class="text-zinc-800 font-bold text-lg mb-2">页面已加密</h3>
            <p class="text-xs text-zinc-500 mb-6 leading-relaxed">此快捷短语页面受密码保护，请输入密码以解锁并查看数据。</p>
            
            <div class="w-full relative">
                <input 
                    v-model="unlockPasswordInput" 
                    type="password" 
                    placeholder="请输入密码..." 
                    class="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-center tracking-widest font-mono"
                    :class="unlockError ? 'focus:ring-red-500/20 focus:border-red-500 border-red-300 bg-red-50/30 text-red-600' : 'focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-800'"
                    @keyup.enter="handleUnlock"
                    autofocus
                />
                <button 
                    @click="handleUnlock" 
                    class="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    解锁页面
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
            </div>
        </div>
    </div>

    <!-- Table Content -->
    <div v-else class="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        <div class="bg-white rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-zinc-200/60 overflow-hidden">
            <div class="overflow-x-auto">
            <table class="text-left border-collapse min-w-full">
                <thead>
                    <tr class="bg-zinc-50/80 border-b border-zinc-200/60 text-xs text-zinc-500 font-semibold tracking-wider">
                        <th class="w-12 min-w-[3rem] py-2.5 px-2 text-center border-r border-zinc-200/40">
                            #
                        </th>
                        <th
                          v-for="(_, index) in localHeaders"
                          :key="index"
                          :style="{ width: `${colWidths[index] || 180}px`, minWidth: `${colWidths[index] || 180}px` }"
                          class="py-2.5 px-4 border-r border-zinc-200/40 relative group/th"
                          @dragover.prevent
                          @drop.prevent="onColDrop(index)"
                        >
                            <div class="flex items-center gap-2">
                                <span class="shrink-0 text-[10px] text-zinc-400 font-mono w-5 text-center">
                                  {{ getColLabel(index) }}
                                </span>
                                <input
                                    type="text"
                                    v-model="localHeaders[index]"
                                    class="w-full bg-transparent border-0 p-0.5 hover:bg-zinc-200/50 focus:bg-white focus:ring-1 focus:ring-indigo-500/50 rounded outline-none transition px-1.5 -mx-1.5 text-zinc-500 font-semibold"
                                    @blur="saveHeaders"
                                    @keyup.enter="(e) => (e.target as HTMLInputElement).blur()"
                                />
                                <button 
                                    class="shrink-0 p-1 text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover/th:opacity-100 transition-all"
                                    :class="{ 'opacity-100 text-indigo-500': isColHidden(index) }"
                                    :title="isColHidden(index) ? '显示该列' : '隐藏该列'"
                                    @click="toggleCol(index)"
                                >
                                    <svg v-if="isColHidden(index)" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                                <button
                                    class="shrink-0 p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/th:opacity-100 transition-all"
                                    title="删除该列"
                                    @click="deleteColumn(index)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                                <span
                                  class="shrink-0 p-1 text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing opacity-0 group-hover/th:opacity-100 transition-all"
                                  title="拖拽调整列顺序"
                                  draggable="true"
                                  @dragstart="onColDragStart(index, $event)"
                                  @dragend="onColDragEnd"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                </span>
                            </div>
                            <div
                              class="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-indigo-200/60 transition"
                              @mousedown="startResize(index, $event)"
                            />
                        </th>
                        <th class="w-16 py-2.5 px-2 text-center">操作</th>
                    </tr>
                </thead>
                <tbody class="text-sm">
                    <!-- Loading / Empty state handled gracefully by empty items array -->
                    <tr v-if="items.length === 0 && !showNewRow" class="border-b border-zinc-100">
                        <td :colspan="currentHeaders.length + 2" class="py-12 text-center text-zinc-400">
                            暂无数据，点击右上角添加
                        </td>
                    </tr>

                    <!-- Data Rows -->
                    <tr
                      v-for="(item, rowIndex) in items"
                      :key="item.id"
                      class="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors group"
                      @dragover.prevent
                      @drop.prevent="onRowDrop(rowIndex)"
                    >
                        <td class="w-12 min-w-[3rem] text-center py-2 px-1 border-r border-zinc-100 bg-zinc-50/50">
                            <div class="flex items-center justify-center gap-1">
                                <span class="text-[11px] text-zinc-500 font-mono select-none">{{ rowIndex + 1 }}</span>
                                <span
                                  class="text-zinc-300 hover:text-zinc-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition"
                                  title="拖拽调整行顺序"
                                  draggable="true"
                                  @dragstart="onRowDragStart(rowIndex, $event)"
                                  @dragend="onRowDragEnd"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                </span>
                            </div>
                        </td>
                        <td v-for="(val, idx) in parseData(item.data)" :key="idx" :style="{ width: `${colWidths[idx] || 180}px`, minWidth: `${colWidths[idx] || 180}px` }" class="py-2 px-4 border-r border-zinc-100 last:border-r-0 relative group/cell">
                            <div class="flex items-center justify-between gap-2">
                                <input 
                                    :type="isHidden(item.id, idx) ? 'password' : 'text'" 
                                    :value="val" 
                                    class="w-full bg-transparent border-0 p-1 outline-none focus:ring-1 focus:ring-indigo-500/50 rounded transition"
                                    :class="isHidden(item.id, idx) ? 'text-zinc-400 tracking-widest' : 'text-zinc-700 placeholder:text-zinc-300'"
                                    :placeholder="isHidden(item.id, idx) ? '******' : '点击编辑...'"
                                    :title="`${getColLabel(idx)}${rowIndex + 1}`"
                                    @click="handleInputClick"
                                    @blur="(e) => updateItem(item.id, idx, (e.target as HTMLInputElement).value)"
                                    @keyup.enter="(e) => (e.target as HTMLInputElement).blur()"
                                />
                                
                                <div class="flex items-center gap-1 shrink-0">
                                    <button 
                                        v-if="val"
                                        class="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded bg-white border border-transparent hover:border-indigo-100 shadow-sm opacity-0 group-hover/cell:opacity-100 transition-all"
                                        title="复制"
                                        @click.stop="copyValue(item.id, idx, val)"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                    </button>
                                </div>
                            </div>
                        </td>
                        <td class="w-16 text-center py-2 px-1">
                            <div class="flex items-center justify-center gap-0.5">
                                <button 
                                    class="p-1.5 text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition-all inline-flex items-center justify-center"
                                    :class="{ 'opacity-100 text-indigo-500': isRowHidden(item.id) }"
                                    :title="isRowHidden(item.id) ? '显示该行' : '隐藏该行'"
                                    @click="toggleRow(item.id)"
                                >
                                    <svg v-if="isRowHidden(item.id)" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                                <button 
                                    class="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all inline-flex items-center justify-center"
                                    title="删除行"
                                    @click="deleteItem(item.id)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </td>
                    </tr>

                    <!-- New Row Input -->
                    <tr v-if="showNewRow" class="bg-indigo-50/30">
                        <td class="w-12 min-w-[3rem] text-center py-2 px-1 border-r border-indigo-100/50 text-[11px] text-indigo-500 font-mono">
                          {{ items.length + 1 }}
                        </td>
                        <td v-for="idx in currentHeaders.length" :key="'new'+idx" :style="{ width: `${colWidths[idx - 1] || 180}px`, minWidth: `${colWidths[idx - 1] || 180}px` }" class="py-2 px-4 border-r border-indigo-100/50">
                            <input 
                                :type="isColHidden(idx - 1) ? 'password' : 'text'" 
                                v-model="newItem[idx - 1]"
                                class="w-full bg-transparent border-0 p-1.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 rounded transition"
                                :class="isColHidden(idx - 1) ? 'text-zinc-600 tracking-widest' : 'text-zinc-700'"
                                :placeholder="isColHidden(idx - 1) ? '******' : currentHeaders[idx-1]"
                                :title="`${getColLabel(idx - 1)}${items.length + 1}`"
                                @keyup.enter="idx === currentHeaders.length ? addNewItem() : null"
                                :autofocus="idx === 1"
                            />
                        </td>
                        <td class="w-16 text-center py-2 px-2">
                            <button 
                                class="p-1.5 text-indigo-500 hover:text-white hover:bg-indigo-500 rounded transition-all shadow-sm inline-flex items-center justify-center"
                                title="保存"
                                @click="addNewItem"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            </div>
        </div>
    </div>
  </div>
</template>
