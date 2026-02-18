<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useClipStore } from "./stores/clipStore";
import { storeToRefs } from "pinia";
import { Clip } from "./types";
import { convertFileSrc, invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from '@tauri-apps/plugin-dialog';
import Settings from "./components/Settings.vue";
import { useI18n } from "./i18n";
import { initShortcuts } from "./composables/useShortcuts";

const { t } = useI18n();

const clipStore = useClipStore();
const { clips, pages, selectedPageId, selectedType } = storeToRefs(clipStore);

// UI 状态
const showNewPageDialog = ref(false);
const showRenamePageDialog = ref(false);
const newPageName = ref('');
const renamePageId = ref('');
const renamePageName = ref('');
const contextMenuClip = ref<Clip | null>(null);
const contextMenuPos = ref({ x: 0, y: 0 });
const showContextMenu = ref(false);
const showSettings = ref(false);
const searchInput = ref('');
const isPinned = ref(false);
const previewImageSrc = ref('');
const previewZoom = ref(1);
const previewClipPath = ref('');
const ocrText = ref('');
const ocrLoading = ref(false);
const showOcrResult = ref(false);
const previewTextContent = ref('');

const openPreview = (src: string, clipPath: string) => {
    previewImageSrc.value = src;
    previewClipPath.value = clipPath;
    previewZoom.value = 1;
    ocrText.value = '';
    showOcrResult.value = false;
};
const closePreview = () => {
    previewImageSrc.value = '';
    previewZoom.value = 1;
    ocrText.value = '';
    showOcrResult.value = false;
};
const zoomIn = () => { previewZoom.value = Math.min(previewZoom.value + 0.25, 5); };
const zoomOut = () => { previewZoom.value = Math.max(previewZoom.value - 0.25, 0.25); };
const zoomReset = () => { previewZoom.value = 1; };
const handleWheel = (e: WheelEvent) => {
    // 仅 Cmd/Ctrl+滚轮 触发缩放，普通滚轮正常滚动
    if (!e.metaKey && !e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
};

const performOcr = async (imagePath?: string) => {
    const path = imagePath || previewClipPath.value;
    if (ocrLoading.value || !path) return;
    ocrLoading.value = true;
    ocrText.value = '';
    showOcrResult.value = true;
    try {
        const text = await invoke<string>('ocr_image', { imagePath: path });
        ocrText.value = text;
        // 如果不在预览模式，直接显示在文本预览弹窗
        if (!previewImageSrc.value) {
            previewTextContent.value = text;
            showOcrResult.value = false;
        }
    } catch (err: any) {
        ocrText.value = `识别失败: ${err}`;
        if (!previewImageSrc.value) {
            previewTextContent.value = `识别失败: ${err}`;
            showOcrResult.value = false;
        }
    } finally {
        ocrLoading.value = false;
    }
};

const copyOcrText = async () => {
    if (!ocrText.value) return;
    try {
        await navigator.clipboard.writeText(ocrText.value);
    } catch { /* fallback */ }
};

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
    } catch { /* fallback */ }
};

const togglePinWindow = async () => {
    isPinned.value = !isPinned.value;
    await getCurrentWindow().setAlwaysOnTop(isPinned.value);
};

// 搜索防抖
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchInput, (val) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        clipStore.search(val);
    }, 300);
});

onMounted(async () => {
    await clipStore.init();
    await clipStore.startListener();
    await initShortcuts();
    // 全局点击关闭右键菜单
    document.addEventListener('click', () => { showContextMenu.value = false; });
});

onUnmounted(() => {
    clipStore.stopListener();
});

// ...


// 文件/图片拖拽：使用 tauri-plugin-drag 原生拖拽（必须在 mousedown 触发）
const handleFileDrag = async (_e: MouseEvent, clip: Clip) => {
    if (clip.type !== 'image' && clip.type !== 'file') return;
    
    const filePath = clip.content;
    console.log("[Drag] Starting native drag for:", filePath);
    
    try {
        const onEvent = new Channel<{ result: string; cursorPos: { x: number; y: number } }>();
        onEvent.onmessage = (message) => {
            console.log("[Drag] Event:", message);
        };

        const payload: any = {
            item: [filePath],
            matchCursor: false, 
            onEvent: onEvent,
        };

        // Ensure image is an object { path: string }
        if (clip.type === 'image') {
            payload.image = { path: filePath };
        } else {
            // For files, provide system icon
            payload.image = {
                path: "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns"
            };
        }

        console.log("[Drag] Invoking start_drag with:", payload);
        await invoke('plugin:drag|start_drag', payload);
        console.log("[Drag] Drag initiated");
    } catch (err) {
        console.error("[Drag] Native drag failed:", err);
    }
};

// 文本拖拽：使用浏览器原生 dataTransfer
const startDrag = (e: DragEvent, clip: Clip) => {
    if (clip.type === 'text') {
        e.dataTransfer!.setData('text/plain', clip.content);
        e.dataTransfer!.effectAllowed = 'copy';
    }
};

const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const getImageSrc = (clip: Clip) => {
    if (clip.type === 'image' && clip.content) {
        return convertFileSrc(clip.content);
    }
    return '';
};

// 右键菜单
const openContextMenu = (e: MouseEvent, clip: Clip) => {
    e.preventDefault();
    contextMenuClip.value = clip;
    contextMenuPos.value = { x: e.clientX, y: e.clientY };
    showContextMenu.value = true;
};

// Page 管理
const createPage = () => {
    if (newPageName.value.trim()) {
        clipStore.createPage(newPageName.value);
        newPageName.value = '';
        showNewPageDialog.value = false;
    }
};
// 页面右键菜单
const showPageMenu = ref(false);
const pageMenuPos = ref({ x: 0, y: 0 });
const pageMenuTarget = ref<any>(null);

const showPageContextMenu = (e: MouseEvent, page: any) => {
    pageMenuPos.value = { x: e.clientX, y: e.clientY };
    pageMenuTarget.value = page;
    showPageMenu.value = true;
    
    const close = () => { showPageMenu.value = false; document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
};

const setCapturePage = () => {
    if (pageMenuTarget.value) {
        clipStore.setCapturePageId(pageMenuTarget.value.id);
    }
    showPageMenu.value = false;
};

const startRename = (page: any) => {
    renamePageId.value = page.id;
    renamePageName.value = page.name;
    showRenamePageDialog.value = true;
};

const confirmRename = () => {
    if (renamePageName.value.trim()) {
        clipStore.renamePage(renamePageId.value, renamePageName.value);
        showRenamePageDialog.value = false;
    }
};

const confirmEmptyPage = async () => {
    if (!pageMenuTarget.value) return;
    const confirmed = await ask(`确定要清空页面 "${pageMenuTarget.value.name}" 中的所有内容吗？此操作不可撤销。`, {
        title: '清空页面',
        kind: 'warning',
        okLabel: '清空',
        cancelLabel: '取消',
    });
    if (confirmed) {
        await clipStore.deleteAllClipsInPage(pageMenuTarget.value.id);
        showPageMenu.value = false;
    }
};

const typeFilters = computed(() => [
    { key: 'all' as const, label: t('all'), icon: 'all' },
    { key: 'text' as const, label: t('text'), icon: 'text' },
    { key: 'image' as const, label: t('image'), icon: 'image' },
    { key: 'file' as const, label: t('file'), icon: 'file' },
]);
</script>

<template>
  <div class="flex h-screen bg-zinc-50 text-zinc-900 font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
    <!-- Sidebar -->
    <aside class="w-64 bg-zinc-50 text-zinc-600 flex flex-col border-r border-zinc-200 shadow-xl z-20 select-none transition-all duration-300">
      <!-- App Header -->
      <div class="h-14 flex items-center justify-between px-4 border-b border-zinc-200/60 bg-zinc-50/50 backdrop-blur-xl shrink-0" data-tauri-drag-region>
        <div class="flex items-center gap-3 text-zinc-800 font-bold text-base tracking-tight pointer-events-none group">
          <div class="relative">
            <div class="absolute inset-0 bg-indigo-500 blur-[8px] opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
            <span class="relative bg-gradient-to-br from-indigo-500 to-purple-600 w-7 h-7 rounded-lg flex items-center justify-center text-xs text-white shadow-md shadow-indigo-500/20">⚡</span>
          </div>
          <span class="bg-clip-text text-transparent bg-gradient-to-r from-zinc-700 to-zinc-500">ClipFlow</span>
        </div>
        
        <!-- Window Controls -->
        <button 
          class="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-300 border border-transparent"
          :class="isPinned ? 'text-indigo-600 bg-indigo-50 border-indigo-200 shadow-sm' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/50'"
          :title="isPinned ? t('unpinWindow') : t('pinWindow')"
          @click="togglePinWindow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transform -rotate-45 block"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
        </button>
      </div>
      
      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
        <div class="flex items-center justify-between px-3 mb-3">
          <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{{ t('pages') }}</span>
          <button
            class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-zinc-200/50 text-zinc-400 hover:text-zinc-700 transition-colors"
            title="New Page"
            @click="showNewPageDialog = true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
        
        <a 
          v-for="page in pages"
          :key="page.id"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group cursor-pointer border border-transparent"
          :class="selectedPageId === page.id 
            ? 'bg-white text-indigo-600 shadow-sm border-zinc-200 ring-1 ring-zinc-200/50' 
            : 'hover:bg-zinc-200/50 hover:text-zinc-900 border-transparent text-zinc-500'"
          @click="clipStore.selectPage(page.id); showSettings = false"
          @contextmenu.prevent="showPageContextMenu($event, page)"
        >
          <span class="opacity-70 group-hover:opacity-100 transition-opacity">
            <svg v-if="page.is_system" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>
          </span>
          <span class="truncate flex-1">{{ page.name }}</span>
          <!-- 捕获目标标记 -->
          <svg 
            v-if="clipStore.capturePageId === page.id"
            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            class="text-emerald-500 shrink-0"
            title="当前捕获目标"
          ><polyline points="20 6 9 17 4 12"/></svg>
          <span 
            v-if="clips.length > 0 && (selectedPageId === page.id)" 
            class="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full font-mono min-w-[1.25rem] text-center"
          >{{ clips.length }}</span>
          
          <!-- 删除按钮 -->
          <button
            v-if="!page.is_system"
            class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all p-1 hover:bg-zinc-100 rounded"
            @click.stop="clipStore.deletePage(page.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </a>
      </nav>
      
      <!-- Bottom -->
      <div class="p-4 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
        <button
          @click="showSettings = !showSettings"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group border border-transparent"
          :class="showSettings ? 'text-indigo-600 bg-indigo-50 border-indigo-100 shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-45 transition-transform duration-300"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>{{ t('settings') }}</span>
        </button>
      </div>
    </aside>

    <!-- Settings View -->
    <Settings v-if="showSettings" @close="showSettings = false" class="flex-1 bg-zinc-50" />

    <!-- Main -->
    <main v-else class="flex-1 flex flex-col h-full relative bg-zinc-50/50">
      <!-- Background Pattern -->
      <div class="absolute inset-0 opacity-[0.015] pointer-events-none" style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px;"></div>

      <!-- Header -->
      <header class="h-14 border-b border-zinc-200/50 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 z-10 shrink-0 shadow-[0_1px_3px_rgb(0,0,0,0.02)]">
        <div class="flex items-center gap-3">
          <h2 class="font-bold text-zinc-800 text-base tracking-tight">{{ clipStore.currentPageName }}</h2>
          <div v-if="selectedType !== 'all'" class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
            {{ typeFilters.find(f => f.key === selectedType)?.label }}
          </div>
        </div>
        
        <div class="flex items-center gap-4">
          <!-- Type Filter Pucks -->
          <div class="flex bg-zinc-100/80 p-1 rounded-lg border border-zinc-200/50 shadow-inner">
            <button
              v-for="f in typeFilters"
              :key="f.key"
              class="px-3 py-1 text-[11px] font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
              :class="selectedType === f.key 
                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' 
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'"
              @click="clipStore.setTypeFilter(f.key)"
            >
              <span class="opacity-70 flex items-center">
                <!-- All -->
                <svg v-if="f.icon === 'all'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg>
                <!-- Text -->
                <svg v-else-if="f.icon === 'text'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>
                <!-- Image -->
                <svg v-else-if="f.icon === 'image'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <!-- File -->
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
              </span>
              <span v-if="selectedType === f.key" class="hidden sm:inline">{{ f.label }}</span>
            </button>
          </div>

          <!-- Search -->
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400 group-focus-within:text-indigo-500 transition-colors"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <input
              v-model="searchInput"
              type="text"
              :placeholder="t('search')"
              class="pl-9 pr-4 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm w-48 transition-all outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/50 placeholder:text-zinc-400 text-zinc-700 shadow-sm"
            >
          </div>
        </div>
      </header>
      
      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 scroll-smooth custom-scrollbar grid grid-cols-2 gap-3 auto-rows-min content-start">
        <!-- Empty State -->
        <div v-if="clips.length === 0" class="col-span-2 flex flex-col items-center justify-center h-[60vh] text-zinc-400 select-none">
          <div class="w-16 h-16 bg-gradient-to-br from-zinc-50 to-zinc-100 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-zinc-100">
            <span class="text-3xl opacity-50 grayscale">📭</span>
          </div>
          <h3 class="text-zinc-600 font-semibold text-base mb-1">{{ t('noClips') }}</h3>
          <p class="text-sm text-zinc-400 text-center max-w-[200px]">{{ t('noClipsHint') }}</p>
        </div>
        
        <!-- Clip List -->
        <div 
          v-for="clip in clips" 
          :key="clip.id"
          class="group bg-white rounded-xl border border-zinc-200/60 p-4 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-indigo-500/30 transition-all duration-300 relative cursor-grab active:cursor-grabbing"
          :class="{'ring-2 ring-indigo-500/10 bg-indigo-50/10': clip.is_pinned}"
          :draggable="clip.type === 'text'"
          @dragstart="startDrag($event, clip)"
          @mousedown="handleFileDrag($event, clip)"
          @contextmenu="openContextMenu($event, clip)"
        >
          <!-- Meta -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <!-- Pin Indicator -->
              <div v-if="clip.is_pinned" class="text-indigo-500" title="Pinned">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19.186 9.687c.237-.777 0-1.87-.71-2.58l-1.583-1.583c-.356-.356-.819-.524-1.285-.524-.482 0-.961.18-1.327.546l-2.071 2.07a14.73 14.73 0 0 1-2.903-1.42 15.344 15.344 0 0 0 1.421-2.905l-2.07-2.07c-.422-.423-1.487-1.442-2.613-.715a2.128 2.128 0 0 0-.846.993 2.112 2.112 0 0 0 .132 1.62l1.625 2.508c-1.164 1.163-4.502 4.148-5.388 5.67l3.858 3.859c1.522-.888 4.507-4.227 5.67-5.39l2.51 1.625c.348.225.753.336 1.156.336.155 0 .311-.016.464-.049.675-.145 1.192-.619 1.417-1.29l2.073-2.07c.366-.366.545-.845.545-1.327 0-.466-.168-.929-.524-1.285z"/></svg>
              </div>
              
              <!-- Type Badge -->
              <span 
                class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border"
                :class="{
                  'bg-white text-indigo-600 border-indigo-100': clip.type === 'text',
                  'bg-white text-emerald-600 border-emerald-100': clip.type === 'image',
                  'bg-white text-amber-600 border-amber-100': clip.type === 'file'
                }"
              >{{ clip.type }}</span>
              <span class="text-[10px] text-zinc-400 font-medium tracking-wide">{{ formatTime(clip.created_at) }}</span>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
              <!-- OCR (image only) -->
              <button
                v-if="clip.type === 'image'"
                class="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="OCR 文字识别"
                @click.stop="performOcr(clip.content)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/><path d="M7 8h6"/><path d="M7 16h8"/></svg>
              </button>
              <button
                class="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="Copy"
                @click.stop="clipStore.copyToClipboard(clip)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
              <button
                class="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-md transition-colors"
                :title="clip.is_pinned ? 'Unpin' : 'Pin'"
                @click.stop="clipStore.togglePin(clip.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" :fill="clip.is_pinned ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
              </button>
              <button
                class="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="Delete"
                @click.stop="clipStore.deleteClip(clip.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
          
          <!-- Content -->
          <div v-if="clip.type === 'text'" class="text-xs text-zinc-600 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-hidden line-clamp-[8] bg-zinc-50/80 p-3 rounded-lg border border-zinc-100/50 selection:bg-indigo-100 selection:text-indigo-900 cursor-pointer" @dblclick.stop="previewTextContent = clip.content">
            {{ clip.content }}
          </div>
          
          <div v-else-if="clip.type === 'image'" class="rounded-lg overflow-hidden bg-zinc-50 border border-zinc-100 flex justify-center p-2 relative group-hover:border-zinc-200 transition-colors cursor-pointer" @dblclick.stop="openPreview(getImageSrc(clip), clip.content)">
            <img :src="getImageSrc(clip)" class="max-h-56 w-auto object-contain relative z-10 shadow-sm rounded" loading="lazy" @error="($event.target as HTMLImageElement).style.display = 'none'" />
            <div class="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur text-[10px] text-zinc-500 font-mono py-1 px-2 border-t border-zinc-100 truncate opacity-0 group-hover:opacity-100 transition-opacity z-20">
              {{ clip.content.split('/').pop() }}
            </div>
          </div>
          
          <div v-else class="text-sm text-zinc-700 flex items-center gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-100 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 transition-colors">
            <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm border border-zinc-100 text-zinc-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="truncate font-medium text-xs">{{ clip.content.split('/').pop() }}</div>
              <div class="text-[10px] text-zinc-400 mt-0.5 truncate">{{ clip.content }}</div>
            </div>
          </div>
        </div>
        
        <!-- Bottom padding -->
        <div class="h-4"></div>
      </div>
    </main>

    <!-- Page Context Menu -->
    <div
      v-if="showPageMenu && pageMenuTarget"
      class="fixed bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-200/50 py-1.5 z-50 min-w-[180px] text-xs transform transition-all duration-100 ring-1 ring-black/5"
      :style="{ left: pageMenuPos.x + 'px', top: pageMenuPos.y + 'px' }"
    >
      <button
        class="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
        :class="clipStore.capturePageId === pageMenuTarget.id ? 'text-emerald-600 bg-emerald-50' : 'text-zinc-700 hover:bg-zinc-100'"
        @click="setCapturePage"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        设为捕获目标
      </button>
      <button
        v-if="!pageMenuTarget.is_system"
        class="w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 flex items-center gap-2 transition-colors"
        @click="startRename(pageMenuTarget); showPageMenu = false"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
        重命名
      </button>
      <div class="h-px bg-zinc-100 my-1 mx-3"></div>
      <button
        class="w-full px-3 py-2 text-left text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
        @click="confirmEmptyPage"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        清空页面内容
      </button>
    </div>

    <!-- Context Menu -->
    <div
      v-if="showContextMenu && contextMenuClip"
      class="fixed bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-200/50 py-1.5 z-50 min-w-[160px] text-xs transform transition-all duration-100 origin-top-left ring-1 ring-black/5"
      :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
    >
      <button class="w-full text-left px-3 py-2 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2.5 transition-colors" @click="clipStore.copyToClipboard(contextMenuClip!); showContextMenu = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        {{ t('copy') }}
      </button>
      <button class="w-full text-left px-3 py-2 hover:bg-amber-50 hover:text-amber-600 flex items-center gap-2.5 transition-colors" @click="clipStore.togglePin(contextMenuClip!.id); showContextMenu = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" :fill="contextMenuClip!.is_pinned ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
        {{ contextMenuClip!.is_pinned ? t('unpin') : t('pin') }}
      </button>
      <div class="h-px bg-zinc-100 my-1 mx-3"></div>
      <button class="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2.5 transition-colors" @click="clipStore.deleteClip(contextMenuClip!.id); showContextMenu = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        {{ t('delete') }}
      </button>
    </div>

    <!-- Dialogs: New/Rename (Shared Style) -->
    <div v-if="showNewPageDialog || showRenamePageDialog" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showNewPageDialog = false; showRenamePageDialog = false">
      <div class="bg-white rounded-2xl shadow-2xl p-6 w-80 transform transition-all scale-100 border border-zinc-100">
        <h3 class="text-base font-bold text-zinc-900 mb-4">{{ showNewPageDialog ? t('newPage') : t('renamePage') }}</h3>
        <input
          v-if="showNewPageDialog"
          v-model="newPageName"
          type="text"
          :placeholder="t('pageName')"
          class="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-zinc-50 focus:bg-white"
          @keyup.enter="createPage"
          autofocus
        >
        <input
          v-else
          v-model="renamePageName"
          type="text"
          :placeholder="t('newName')"
          class="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-zinc-50 focus:bg-white"
          @keyup.enter="confirmRename"
          autofocus
        >
        <div class="flex justify-end gap-3 mt-6">
          <button class="px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors" @click="showNewPageDialog = false; showRenamePageDialog = false">{{ t('cancel') }}</button>
          <button 
            class="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-500/30"
            @click="showNewPageDialog ? createPage() : confirmRename()"
          >
            {{ showNewPageDialog ? t('create') : t('save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Image Preview Lightbox -->
    <div
      v-if="previewImageSrc"
      class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]"
      @click.self="closePreview"
      @wheel="handleWheel"
    >
      <!-- Close -->
      <button
        class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-colors z-[101]"
        @click="closePreview"
      >×</button>
      
      <!-- Zoom Controls -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 z-[101]">
        <button class="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold" @click="zoomOut">−</button>
        <span class="text-white/80 text-xs font-mono min-w-[3rem] text-center select-none">{{ Math.round(previewZoom * 100) }}%</span>
        <button class="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold" @click="zoomIn">＋</button>
        <div class="w-px h-4 bg-white/20 mx-1"></div>
        <button class="px-2 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors text-[10px] font-medium" @click="zoomReset">Reset</button>
        <div class="w-px h-4 bg-white/20 mx-1"></div>
        <button 
          class="px-3 h-7 flex items-center justify-center gap-1.5 rounded-full transition-colors text-[10px] font-semibold"
          :class="ocrLoading ? 'bg-indigo-500/30 text-indigo-300 cursor-wait' : 'bg-indigo-500/80 text-white hover:bg-indigo-500'"
          @click="() => performOcr()"
          :disabled="ocrLoading"
        >
          <svg v-if="ocrLoading" class="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10" /></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/><path d="M7 8h6"/><path d="M7 16h8"/></svg>
          OCR
        </button>
      </div>
      
      <!-- OCR Result Panel -->
      <div 
        v-if="showOcrResult"
        class="absolute top-4 left-4 bottom-20 w-72 bg-black/70 backdrop-blur-xl rounded-2xl border border-white/10 flex flex-col z-[102] shadow-2xl transition-all"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span class="text-white/90 text-xs font-semibold flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/><path d="M7 8h6"/><path d="M7 16h8"/></svg> OCR 识别结果</span>
          <div class="flex items-center gap-1.5">
            <button 
              v-if="ocrText && !ocrLoading"
              class="px-2 py-1 rounded-md text-[10px] text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              @click="copyOcrText"
            >复制</button>
            <button 
              class="w-6 h-6 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors text-sm"
              @click="showOcrResult = false"
            >×</button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <div v-if="ocrLoading" class="flex items-center justify-center h-full">
            <div class="flex flex-col items-center gap-3">
              <svg class="animate-spin w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10" /></svg>
              <span class="text-white/50 text-xs">正在识别中...</span>
            </div>
          </div>
          <pre v-else class="text-white/90 text-xs leading-relaxed whitespace-pre-wrap break-words font-sans select-all">{{ ocrText }}</pre>
        </div>
      </div>
      
      <!-- Image -->
      <div class="overflow-auto max-w-[95vw] max-h-[90vh] flex items-center justify-center" :class="previewZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'" @click.self="previewZoom <= 1 ? closePreview() : null">
        <img
          :src="previewImageSrc"
          class="transition-transform duration-150 ease-out rounded-lg shadow-2xl"
          :style="{ transform: `scale(${previewZoom})` }"
          @click.stop="previewZoom <= 1 ? zoomIn() : null"
        />
      </div>
    </div>

    <!-- Text Preview Lightbox -->
    <div
      v-if="previewTextContent"
      class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]"
      @click.self="previewTextContent = ''"
    >
      <button
        class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-colors z-[101]"
        @click="previewTextContent = ''"
      >×</button>
      <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-[85vw] max-h-[85vh] w-[600px] flex flex-col border border-zinc-200/50">
        <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
          <span class="text-xs font-semibold text-zinc-500 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-4"/><path d="M16 17h-8"/></svg> 文本内容</span>
          <button
            class="px-3 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            @click="copyText(previewTextContent)"
          >复制全部</button>
        </div>
        <div class="flex-1 overflow-auto p-5">
          <pre class="text-sm text-zinc-700 font-mono leading-relaxed whitespace-pre-wrap break-words select-all">{{ previewTextContent }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(161, 161, 170, 0.2); /* Zinc 400 at 20% opacity */
  border-radius: 9999px;
  transition: background 0.2s;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: rgba(161, 161, 170, 0.4);
}

aside::-webkit-scrollbar {
  width: 4px;
}
aside::-webkit-scrollbar-thumb {
  background: #27272a; /* Zinc 800 */
  border-radius: 9999px;
}
</style>