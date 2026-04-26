<script setup lang="ts">
import { computed } from 'vue';

type DialogMode = 'create-clip-page' | 'create-snippet-page' | 'rename-clip-page';

const props = defineProps<{
  visible: boolean;
  mode: DialogMode;
  pageName: string;
  renameName: string;
  snippetCols: number;
  snippetRows: number;
  createLabel: string;
  saveLabel: string;
  cancelLabel: string;
  pageNamePlaceholder: string;
  newNamePlaceholder: string;
  newPageTitle: string;
  renamePageTitle: string;
}>();

const emit = defineEmits<{
  (e: 'update:page-name', value: string): void;
  (e: 'update:rename-name', value: string): void;
  (e: 'update:snippet-cols', value: number): void;
  (e: 'update:snippet-rows', value: number): void;
  (e: 'close'): void;
  (e: 'submit'): void;
}>();

const isCreateMode = computed(() => props.mode !== 'rename-clip-page');
const isSnippetMode = computed(() => props.mode === 'create-snippet-page');
const dialogTitle = computed(() => {
  if (props.mode === 'create-snippet-page') return '新快捷短语页';
  return props.mode === 'create-clip-page' ? props.newPageTitle : props.renamePageTitle;
});
const submitLabel = computed(() => (isCreateMode.value ? props.createLabel : props.saveLabel));
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-2xl shadow-2xl p-6 w-80 transform transition-all scale-100 border border-zinc-100">
      <h3 class="text-base font-bold text-zinc-900 mb-4">{{ dialogTitle }}</h3>

      <input
        v-if="isCreateMode"
        :value="pageName"
        type="text"
        :placeholder="pageNamePlaceholder"
        class="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-zinc-50 focus:bg-white"
        autofocus
        @input="emit('update:page-name', ($event.target as HTMLInputElement).value)"
        @keyup.enter="emit('submit')"
      >

      <div v-if="isSnippetMode" class="flex gap-3 mt-4">
        <div class="flex-1">
          <label class="block text-xs font-semibold text-zinc-500 mb-1.5 ml-1">列数 (Cols)</label>
          <input
            :value="snippetCols"
            type="number"
            min="1"
            max="10"
            class="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            @input="emit('update:snippet-cols', Number(($event.target as HTMLInputElement).value))"
          >
        </div>
        <div class="flex-1">
          <label class="block text-xs font-semibold text-zinc-500 mb-1.5 ml-1">初始行数 (Rows)</label>
          <input
            :value="snippetRows"
            type="number"
            min="0"
            max="20"
            class="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            @input="emit('update:snippet-rows', Number(($event.target as HTMLInputElement).value))"
          >
        </div>
      </div>

      <input
        v-else
        :value="renameName"
        type="text"
        :placeholder="newNamePlaceholder"
        class="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-zinc-50 focus:bg-white"
        autofocus
        @input="emit('update:rename-name', ($event.target as HTMLInputElement).value)"
        @keyup.enter="emit('submit')"
      >

      <div class="flex justify-end gap-3 mt-6">
        <button
          class="px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
          @click="emit('close')"
        >
          {{ cancelLabel }}
        </button>
        <button
          class="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-500/30"
          @click="emit('submit')"
        >
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
