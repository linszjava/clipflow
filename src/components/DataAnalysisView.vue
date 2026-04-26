<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useAnalysisStore } from '../stores/analysisStore';
import { storeToRefs } from 'pinia';

const analysisStore = useAnalysisStore();
const { pages, selectedPageId } = storeToRefs(analysisStore);

const currentPage = computed(() => analysisStore.currentPage);

const summary = computed(() => {
  const rows = currentPage.value?.rows || [];
  const totalCopies = rows.reduce((sum, r) => sum + r.totalCopies, 0);
  const totalCopiesLast7Days = rows.reduce((sum, r) => sum + r.copiesLast7Days, 0);
  const top1 = rows[0];
  const top1Ratio = totalCopies > 0 && top1 ? Number(((top1.totalCopies / totalCopies) * 100).toFixed(1)) : 0;
  const avgPerValue = rows.length > 0 ? Number((totalCopies / rows.length).toFixed(2)) : 0;
  return {
    uniqueValues: rows.length,
    totalCopies,
    totalCopiesLast7Days,
    top1Ratio,
    avgPerValue,
  };
});

const trendMax = computed(() => {
  const arr = currentPage.value?.dailyTrend14d || [];
  return Math.max(1, ...arr.map((p) => p.copies));
});

const topRows = computed(() => {
  const rows = currentPage.value?.rows || [];
  return rows.slice(0, 5).map((r) => ({
    ...r,
    ratio: summary.value.totalCopies > 0 ? Number(((r.totalCopies / summary.value.totalCopies) * 100).toFixed(1)) : 0,
  }));
});

const hourlyPeak = computed(() => {
  const arr = currentPage.value?.hourlyDistribution || [];
  if (arr.length === 0) return { hour: '-', copies: 0 };
  const peak = arr.reduce((best, cur) => (cur.copies > best.copies ? cur : best), arr[0]);
  return {
    hour: `${String(peak.hour).padStart(2, '0')}:00`,
    copies: peak.copies,
  };
});

const formatTime = (iso: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
};

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const startAutoRefresh = () => {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    analysisStore.refreshCurrentPage();
  }, 3000);
};

const stopAutoRefresh = () => {
  if (!refreshTimer) return;
  clearInterval(refreshTimer);
  refreshTimer = null;
};

watch(selectedPageId, async () => {
  await analysisStore.refreshCurrentPage();
});

onMounted(async () => {
  await analysisStore.refreshCurrentPage();
  startAutoRefresh();
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="flex-1 flex flex-col h-full bg-zinc-50/50">
    <header class="h-14 border-b border-zinc-200/50 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 z-10 shrink-0 shadow-[0_1px_3px_rgb(0,0,0,0.02)]">
      <div class="flex items-center gap-3">
        <div class="w-6 h-6 bg-purple-100 text-purple-600 rounded-md flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </div>
        <h2 class="font-bold text-zinc-800 text-base tracking-tight">
          {{ currentPage ? currentPage.name : '数据分析' }}
        </h2>
      </div>
      <div class="text-xs text-zinc-400">
        生成时间：{{ currentPage ? formatTime(currentPage.generatedAt) : '-' }}
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div v-if="!currentPage" class="text-sm text-zinc-400 py-8">
        暂无分析页面。请在快捷短语页面右键并选择“生成数据分析”。
      </div>

      <template v-else>
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">唯一数据项</div>
            <div class="text-2xl font-bold text-zinc-700 mt-1">{{ summary.uniqueValues }}</div>
          </div>
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">总复制次数</div>
            <div class="text-2xl font-bold text-zinc-700 mt-1">{{ summary.totalCopies }}</div>
          </div>
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">近 7 天复制次数</div>
            <div class="text-2xl font-bold text-zinc-700 mt-1">{{ summary.totalCopiesLast7Days }}</div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">Top1 占比</div>
            <div class="text-2xl font-bold text-purple-600 mt-1">{{ summary.top1Ratio }}%</div>
          </div>
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">单项平均复制次数</div>
            <div class="text-2xl font-bold text-zinc-700 mt-1">{{ summary.avgPerValue }}</div>
          </div>
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-xs text-zinc-400">最活跃时段</div>
            <div class="text-xl font-bold text-zinc-700 mt-1">{{ hourlyPeak.hour }}</div>
            <div class="text-xs text-zinc-400 mt-1">复制 {{ hourlyPeak.copies }} 次</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-5">
          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-sm font-semibold text-zinc-700 mb-3">近 14 天复制趋势</div>
            <div class="flex items-end gap-1 h-36">
              <div
                v-for="point in currentPage.dailyTrend14d"
                :key="point.date"
                class="flex-1 flex flex-col justify-end items-center"
                :title="`${point.date}: ${point.copies}`"
              >
                <div
                  class="w-full rounded-t bg-gradient-to-t from-purple-500 to-indigo-400"
                  :style="{ height: `${Math.max(4, (point.copies / trendMax) * 100)}%` }"
                />
                <div class="text-[10px] text-zinc-400 mt-1">{{ point.date.slice(5) }}</div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-zinc-200/60 p-4">
            <div class="text-sm font-semibold text-zinc-700 mb-3">Top 5 数据占比</div>
            <div class="space-y-2">
              <div v-for="row in topRows" :key="row.value" class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-600 truncate max-w-[220px]" :title="row.value">{{ row.value }}</span>
                  <span class="text-zinc-500">{{ row.totalCopies }} 次 ({{ row.ratio }}%)</span>
                </div>
                <div class="h-2 rounded bg-zinc-100 overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-purple-500 to-indigo-400" :style="{ width: `${row.ratio}%` }" />
                </div>
              </div>
              <div v-if="topRows.length === 0" class="text-xs text-zinc-400 py-4">暂无可视化数据</div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-zinc-200/60 overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-zinc-50/80 border-b border-zinc-200/60 text-xs text-zinc-500 font-semibold tracking-wider">
                <th class="py-2.5 px-4">数据内容</th>
                <th class="py-2.5 px-4 w-36">复制总次数</th>
                <th class="py-2.5 px-4 w-36">近 7 天次数</th>
                <th class="py-2.5 px-4 w-44">近 7 天日均频率</th>
                <th class="py-2.5 px-4 w-56">最近复制时间</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr v-if="pages.length > 0 && currentPage.rows.length === 0">
                <td colspan="5" class="py-10 text-center text-zinc-400">暂无复制记录可分析</td>
              </tr>
              <tr
                v-for="(row, idx) in currentPage.rows"
                :key="`${idx}-${row.value}`"
                class="border-b border-zinc-100 hover:bg-zinc-50/60 transition-colors"
              >
                <td class="py-2.5 px-4 text-zinc-700 truncate max-w-[360px]" :title="row.value">
                  {{ row.value }}
                </td>
                <td class="py-2.5 px-4 text-zinc-600">{{ row.totalCopies }}</td>
                <td class="py-2.5 px-4 text-zinc-600">{{ row.copiesLast7Days }}</td>
                <td class="py-2.5 px-4 text-zinc-600">{{ row.avgCopiesPerDay7Days }}</td>
                <td class="py-2.5 px-4 text-zinc-500">{{ row.lastCopiedAt || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
