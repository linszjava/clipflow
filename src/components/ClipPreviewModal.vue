<script setup lang="ts">
import { computed, ref } from 'vue';
import { clipApi } from '../services/tauri/clipApi';

const props = defineProps<{
  imageSrc: string;
  imagePath: string;
  textContent: string;
}>();

const emit = defineEmits<{
  (e: 'update:image-src', value: string): void;
  (e: 'update:image-path', value: string): void;
  (e: 'update:text-content', value: string): void;
}>();

const previewZoom = ref(1);
const ocrText = ref('');
const ocrLoading = ref(false);
const showOcrResult = ref(false);

const hasImagePreview = computed(() => Boolean(props.imageSrc));
const hasTextPreview = computed(() => Boolean(props.textContent));

const resetImagePreviewState = () => {
  previewZoom.value = 1;
  ocrText.value = '';
  showOcrResult.value = false;
};

const closeImagePreview = () => {
  emit('update:image-src', '');
  emit('update:image-path', '');
  resetImagePreviewState();
};

const closeTextPreview = () => {
  emit('update:text-content', '');
};

const zoomIn = () => {
  previewZoom.value = Math.min(previewZoom.value + 0.25, 5);
};

const zoomOut = () => {
  previewZoom.value = Math.max(previewZoom.value - 0.25, 0.25);
};

const zoomReset = () => {
  previewZoom.value = 1;
};

const handleWheel = (e: WheelEvent) => {
  if (!e.metaKey && !e.ctrlKey) return;
  e.preventDefault();
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
};

const performOcr = async () => {
  if (ocrLoading.value || !props.imagePath) return;
  ocrLoading.value = true;
  ocrText.value = '';
  showOcrResult.value = true;

  try {
    const text = await clipApi.ocrImage(props.imagePath);
    ocrText.value = text;
  } catch (err: unknown) {
    ocrText.value = `识别失败: ${String(err)}`;
  } finally {
    ocrLoading.value = false;
  }
};

const copyOcrText = async () => {
  if (!ocrText.value) return;
  try {
    await navigator.clipboard.writeText(ocrText.value);
  } catch {
    // no-op
  }
};

const copyText = async () => {
  if (!props.textContent) return;
  try {
    await navigator.clipboard.writeText(props.textContent);
  } catch {
    // no-op
  }
};
</script>

<template>
  <div
    v-if="hasImagePreview"
    class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]"
    @click.self="closeImagePreview"
    @wheel="handleWheel"
  >
    <button
      class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-colors z-[101]"
      @click="closeImagePreview"
    >×</button>

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
        @click="performOcr"
        :disabled="ocrLoading"
      >
        <svg v-if="ocrLoading" class="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10" /></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/><path d="M7 8h6"/><path d="M7 16h8"/></svg>
        OCR
      </button>
    </div>

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

    <div class="overflow-auto max-w-[95vw] max-h-[90vh] flex items-center justify-center" :class="previewZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'" @click.self="previewZoom <= 1 ? closeImagePreview() : null">
      <img
        :src="imageSrc"
        class="transition-transform duration-150 ease-out rounded-lg shadow-2xl"
        :style="{ transform: `scale(${previewZoom})` }"
        @click.stop="previewZoom <= 1 ? zoomIn() : null"
      />
    </div>
  </div>

  <div
    v-if="hasTextPreview"
    class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]"
    @click.self="closeTextPreview"
  >
    <button
      class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-colors z-[101]"
      @click="closeTextPreview"
    >×</button>
    <div class="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl max-w-[85vw] max-h-[85vh] w-[600px] flex flex-col border border-zinc-200/50">
      <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
        <span class="text-xs font-semibold text-zinc-500 flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-4"/><path d="M16 17h-8"/></svg> 文本内容</span>
        <button
          class="px-3 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
          @click="copyText"
        >复制全部</button>
      </div>
      <div class="flex-1 overflow-auto p-5">
        <pre class="text-sm text-zinc-700 font-mono leading-relaxed whitespace-pre-wrap break-words select-all">{{ textContent }}</pre>
      </div>
    </div>
  </div>
</template>
