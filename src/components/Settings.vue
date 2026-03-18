<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
      <h1 class="text-lg font-semibold text-zinc-800">{{ t('settingsTitle') }}</h1>
      <button @click="$emit('close')" class="text-zinc-400 hover:text-zinc-600 text-xl leading-none">&times;</button>
    </header>

    <!-- Tabs -->
    <div class="flex border-b border-zinc-200 px-6">
      <button 
        v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        class="px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === tab.id 
          ? 'text-emerald-600' 
          : 'text-zinc-500 hover:text-zinc-700'"
      >
        {{ tab.icon }} {{ tab.label }}
        <div v-if="activeTab === tab.id" class="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t"></div>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 py-5">
      <!-- General Tab -->
      <div v-if="activeTab === 'general'" class="space-y-6">

        <!-- 语言 -->
        <div class="settings-row">
          <label class="settings-label">{{ t('language') }}</label>
          <div class="flex bg-zinc-100 rounded-lg p-0.5">
            <button 
              v-for="l in languages" :key="l.id"
              @click="switchLanguage(l.id)"
              class="px-4 py-1.5 text-sm rounded-md transition-all"
              :class="lang === l.id 
                ? 'bg-white shadow-sm text-zinc-800 font-medium' 
                : 'text-zinc-500 hover:text-zinc-700'"
            >
              {{ l.label }}
            </button>
          </div>
        </div>

        <hr class="border-zinc-100" />

        <!-- 历史保留 -->
        <div class="settings-row">
          <label class="settings-label">{{ t('keepHistory') }}</label>
          <div class="flex items-center gap-3">
            <select 
              v-model="keepHistoryMode" 
              @change="onKeepHistoryChange"
              class="bg-zinc-100 border-none rounded-lg px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-emerald-200 outline-none"
            >
              <option :value="7">{{ t('days7') }}</option>
              <option :value="30">{{ t('days30') }}</option>
              <option :value="-1">{{ t('customDate') }}</option>
              <option :value="36500">{{ t('forever') }}</option>
            </select>
            <button 
              @click="showClearConfirm = true" 
              class="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              {{ t('clearAll') }}
            </button>
          </div>
        </div>

        <!-- 自定义日期 -->
        <div v-if="keepHistoryMode === -1" class="settings-row pl-6">
          <label class="settings-label text-zinc-400 text-xs">{{ t('deleteBeforeDate') }}</label>
          <div class="flex items-center gap-2">
            <input 
              type="datetime-local" 
              v-model="customDeleteDate"
              @input="onCustomDateChange"
              @change="onCustomDateChange"
              class="bg-zinc-100 border-none rounded-lg px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-emerald-200 outline-none"
            />
            <button 
              @click="applyHistoryPolicy" 
              class="px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              执行清理
            </button>
          </div>
        </div>

        <!-- 清理结果反馈 -->
        <div v-if="cleanupMessage" class="text-xs pl-2 transition-all" :class="cleanupMessage.includes('✅') ? 'text-emerald-500' : 'text-zinc-400'">
          {{ cleanupMessage }}
        </div>

        <!-- 历史保留策略说明 -->
        <div v-if="keepHistoryMode !== 36500 && keepHistoryMode !== -1" class="text-xs text-zinc-400 pl-2">
          {{ policyDescription }}
        </div>

        <hr class="border-zinc-100" />

        <!-- 文件及图片存储位置 -->
        <div class="settings-row">
          <label class="settings-label">文件存储目录</label>
          <div class="space-y-2 flex-1 min-w-0 pr-2">
            <div class="text-xs text-zinc-400 mt-1 mb-2">用于存放拖拽系统收集的文件或截图</div>
            <div class="text-[10px] text-zinc-400 font-mono bg-zinc-50 px-3 py-2 rounded-lg break-all select-all border border-zinc-100/80">
              {{ storagePath || '加载中...' }}
            </div>
            <div class="flex items-center gap-2">
              <button 
                @click="openInFinder" 
                class="settings-btn"
              >
                {{ t('openInFinder') }}
              </button>
              <button 
                @click="changeStoragePath" 
                class="settings-btn"
              >
                {{ t('change') }}
              </button>
              <button 
                v-if="isCustomPath"
                @click="resetStoragePath" 
                class="settings-btn text-red-400 hover:text-red-500"
              >
                {{ t('reset') }}
              </button>
            </div>
          </div>
        </div>

        <hr class="border-zinc-100" />

        <!-- 数据库存储位置（快捷短语及文本数据） -->
        <div class="settings-row">
          <label class="settings-label">核心数据库位置</label>
          <div class="space-y-2 flex-1 min-w-0 pr-2">
            <div class="text-xs text-zinc-400 mt-1 mb-2">系统核心的 SQLite 数据库，安全存放您所有的『快捷短语表单』和纯文本记录。为了防范数据损坏，核心数据库路径只能由系统管理。</div>
            <div class="text-[10px] text-emerald-500 font-mono bg-emerald-50/50 px-3 py-2 rounded-lg break-all select-all border border-emerald-100/50">
              {{ dbPath || '加载中...' }}
            </div>
            <div class="flex items-center gap-2">
              <button 
                @click="openDbInFinder" 
                class="settings-btn flex items-center gap-1.5 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 border border-emerald-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                在 Finder 中打开
              </button>
            </div>
          </div>
        </div>

        <hr class="border-zinc-100" />

        <!-- 快捷键 -->
        <div class="space-y-4">
          <label class="settings-label block">快捷键</label>
          
          <!-- 开关自动复制 -->
          <div class="settings-row">
            <div class="flex-1">
              <div class="text-sm text-zinc-700 font-medium">开关自动捕获</div>
              <div class="mt-1">
                <button 
                  class="text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-all duration-200"
                  :class="autoCapture 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' 
                    : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-700'"
                  @click="toggleMonitorState"
                  title="点击切换状态"
                >
                  <span>{{ autoCapture ? '✅' : '⏸️' }}</span>
                  <span class="font-medium">{{ autoCapture ? '已开启' : '已暂停' }}</span>
                </button>
              </div>
            </div>
            <button
              class="shortcut-key-btn"
              :class="recordingTarget === 'capture' ? 'recording' : ''"
              @click="startRecording('capture')"
              @keydown="onShortcutKeyDown($event, 'capture')"
              @blur="cancelRecording"
              tabindex="0"
            >
              {{ recordingTarget === 'capture' ? '请按下快捷键...' : formatShortcut(shortcuts.capture) }}
            </button>
          </div>

          <!-- 开关窗口 -->
          <div class="settings-row">
            <div class="flex-1">
              <div class="text-sm text-zinc-700 font-medium">显示/隐藏窗口</div>
              <div class="text-xs text-zinc-400 mt-1">全局快捷键切换窗口可见性</div>
            </div>
            <button
              class="shortcut-key-btn"
              :class="recordingTarget === 'toggle' ? 'recording' : ''"
              @click="startRecording('toggle')"
              @keydown="onShortcutKeyDown($event, 'toggle')"
              @blur="cancelRecording"
              tabindex="0"
            >
              {{ recordingTarget === 'toggle' ? '请按下快捷键...' : formatShortcut(shortcuts.toggle) }}
            </button>
          </div>
        </div>
      </div>

      <!-- About Tab -->
      <div v-if="activeTab === 'about'" class="flex flex-col items-center justify-center py-12 space-y-4">
        <div class="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg">
          📋
        </div>
        <h2 class="text-xl font-bold text-zinc-800">Quick Snap</h2>
        <p class="text-sm text-zinc-400">版本 v1.0.2</p>
        <p class="text-xs text-zinc-400 mt-2">{{ t('description') }}</p>

        <!-- GitHub Link -->
        <button 
          @click="openGithubRepo"
          class="mt-4 flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors border border-zinc-200/50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.37 4.37 0 0 0 9 18.13V22"/></svg>
          GitHub 仓库源
        </button>
        <div class="mt-6 text-xs text-zinc-300">
          {{ t('builtWith') }}
        </div>
      </div>
    </div>

    <!-- Clear confirm dialog -->
    <div v-if="showClearConfirm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showClearConfirm = false">
      <div class="bg-white rounded-xl shadow-2xl p-6 w-80 space-y-4">
        <h3 class="text-base font-semibold text-zinc-800">{{ t('clearConfirmTitle') }}</h3>
        <p class="text-sm text-zinc-500">{{ t('clearConfirmMsg') }}</p>
        <div class="flex justify-end gap-3 pt-2">
          <button @click="showClearConfirm = false" class="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition-colors">{{ t('cancel') }}</button>
          <button @click="confirmClearAll" class="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">{{ t('confirmDelete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useClipStore } from '../stores/clipStore';
import { useI18n } from '../i18n';
import type { Lang } from '../i18n';



const clipStore = useClipStore();
const { t, lang, setLang } = useI18n();

// Tabs — 使用 computed 实现语言响应
const tabs = computed(() => [
  { id: 'general', label: t('generalTab'), icon: '⚙️' },
  { id: 'about', label: t('aboutTab'), icon: 'ℹ️' },
]);
const activeTab = ref('general');

const openGithubRepo = async () => {
    try {
        await openUrl('https://github.com/linszjava/clipflow');
    } catch(e) {
        console.error('Failed to open GitHub repository', e);
    }
};

// 语言
const languages = [
  { id: 'zh' as Lang, label: '中文' },
  { id: 'en' as Lang, label: 'English' },
];

function switchLanguage(newLang: Lang) {
  setLang(newLang);
}

// 历史保留
const keepHistoryMode = ref(parseInt(localStorage.getItem('quicksnap-keep-history') || '30'));
const customDeleteDate = ref('');

// 保留策略描述
const policyDescription = computed(() => {
  if (keepHistoryMode.value === 7) {
    return lang.value === 'zh' 
      ? '将自动删除 7 天前的未置顶记录' 
      : 'Unpinned records older than 7 days will be auto-deleted';
  }
  if (keepHistoryMode.value === 30) {
    return lang.value === 'zh' 
      ? '将自动删除 30 天前的未置顶记录' 
      : 'Unpinned records older than 30 days will be auto-deleted';
  }
  return '';
});

// 清理反馈
const cleanupMessage = ref('');

function onKeepHistoryChange() {
  localStorage.setItem('quicksnap-keep-history', String(keepHistoryMode.value));
  cleanupMessage.value = '';
  applyHistoryPolicy();
}

function onCustomDateChange() {
  if (customDeleteDate.value) {
    localStorage.setItem('quicksnap-custom-delete-date', customDeleteDate.value);
  }
}

// 格式化为本地时间字符串 YYYY-MM-DD HH:MM:SS
function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function applyHistoryPolicy() {
  const mode = keepHistoryMode.value;
  if (mode === 36500) return; // 永不删除

  let cutoffDate: Date;
  if (mode === -1) {
    // 自定义日期
    if (!customDeleteDate.value) return;
    cutoffDate = new Date(customDeleteDate.value);
  } else {
    // N 天前
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - mode);
  }

  // 使用本地时间格式（与 SQLite datetime('now','localtime') 一致）
  const dateStr = formatLocalDate(cutoffDate);
  console.log(`[Settings] Cleanup: deleting unpinned clips before ${dateStr}`);
  const count = await clipStore.deleteClipsBefore(dateStr);
  
  if (count > 0) {
    cleanupMessage.value = `✅ 已删除 ${count} 条记录`;
  } else {
    cleanupMessage.value = '✅ 没有需要清理的记录';
  }
  setTimeout(() => { cleanupMessage.value = ''; }, 3000);
}

// 清除所有
const showClearConfirm = ref(false);
async function confirmClearAll() {
  await clipStore.clearAllClipsGlobal();
  showClearConfirm.value = false;
}

// 存储路径
const storagePath = ref('');

async function loadStoragePath() {
  try {
    storagePath.value = await invoke<string>('get_storage_path');
  } catch (e) {
    console.error('[Settings] Failed to get storage path:', e);
    storagePath.value = '无法获取路径';
  }
}

async function openInFinder() {
  try {
    await invoke('open_storage_in_finder');
  } catch (e) {
    console.error('[Settings] Failed to open in Finder:', e);
  }
}

// 数据库路径逻辑
const dbPath = ref('');

async function loadDbPath() {
  try {
    dbPath.value = await invoke<string>('get_db_path');
  } catch (e) {
    console.error('[Settings] Failed to get db path:', e);
    dbPath.value = '无法获取数据库路径';
  }
}

async function openDbInFinder() {
  try {
    await invoke('open_db_in_finder');
  } catch (e) {
    console.error('[Settings] Failed to open db in Finder:', e);
  }
}

const isCustomPath = ref(false);

async function checkIsCustomPath() {
  try {
    isCustomPath.value = await invoke<boolean>('is_custom_storage');
  } catch (e) {
    console.error('[Settings] Failed to check custom path:', e);
  }
}

async function changeStoragePath() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('storagePath'),
    });
    
    if (selected && typeof selected === 'string') {
      await invoke('set_storage_path', { path: selected });
      await loadStoragePath();
      isCustomPath.value = true;
    }
  } catch (e) {
    console.error('[Settings] Failed to change storage path:', e);
  }
}

async function resetStoragePath() {
  try {
    await invoke('set_storage_path', { path: null });
    await loadStoragePath();
    isCustomPath.value = false;
  } catch (e) {
    console.error('[Settings] Failed to reset storage path:', e);
  }
}

import { useShortcuts } from '../composables/useShortcuts';

const { 
  shortcuts, 
  autoCapture, 
  recordingTarget, 
  formatShortcut, 
  startRecording, 
  cancelRecording,
  toggleMonitorState, // Imported
  onShortcutKeyDown 
} = useShortcuts();

// 移除本地定义的 shortcuts, recordingTarget, autoCapture, startRecording, onShortcutKeyDown, registerShortcuts, loadMonitorState

onMounted(() => {
  loadStoragePath();
  checkIsCustomPath();
  loadDbPath();
  // loadMonitorState -> 已在 useShortcuts 初始化时处理，或保持监听
  // registerShortcuts -> 已在 App.vue 处理
  
  // 恢复自定义日期
  const saved = localStorage.getItem('quicksnap-custom-delete-date');
  if (saved) {
    customDeleteDate.value = saved;
  }
});
</script>

<style scoped>
.settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.settings-label {
  font-size: 14px;
  font-weight: 500;
  color: #3f3f46;
  white-space: nowrap;
  padding-top: 8px;
  min-width: 100px;
}
.settings-btn {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #52525b;
  transition: all 0.15s;
  cursor: pointer;
  border: none;
}
.settings-btn:hover {
  background: #e4e4e7;
  color: #18181b;
}
.shortcut-key-btn {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 6px 14px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #52525b;
  border: 1.5px solid #e4e4e7;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 160px;
  text-align: center;
  outline: none;
}
.shortcut-key-btn:hover {
  background: #e4e4e7;
  border-color: #d4d4d8;
}
.shortcut-key-btn:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}
.shortcut-key-btn.recording {
  background: #eef2ff;
  border-color: #6366f1;
  color: #6366f1;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
