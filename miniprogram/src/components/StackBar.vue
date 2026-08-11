<script setup lang="ts">
import { computed } from 'vue'

/**
 * StackBar：纯 CSS 水平堆叠条，用于分值构成（一段一色 + 图例）。
 * 图例保留每段的标签与分值，不丢信息。
 */

export interface StackItem {
  label: string
  value: number
}

const props = defineProps<{ rows: StackItem[] }>()

// 与网页版 PALETTE 同色序，改用 design-tokens 变量
const PALETTE = ['var(--brand)', 'var(--xc)', 'var(--sw)', 'var(--sl)', 'var(--brand-dark)', 'var(--text-3)']

const total = computed(() => props.rows.reduce((s, r) => s + r.value, 0) || 1)
const segs = computed(() =>
  props.rows.map((r, i) => ({
    label: r.label,
    value: r.value,
    color: PALETTE[i % PALETTE.length],
    width: (r.value / total.value) * 100
  }))
)
</script>

<template>
  <view class="stack">
    <view class="stack-bar">
      <view
        v-for="s in segs"
        :key="s.label"
        class="stack-seg"
        :style="{ width: s.width + '%', background: s.color }"
      ></view>
    </view>
    <view class="stack-legend">
      <view v-for="s in segs" :key="s.label" class="legend-item">
        <view class="legend-dot" :style="{ background: s.color }"></view>
        <text class="legend-label">{{ s.label }}</text>
        <text class="legend-val">{{ s.value }} 分</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.stack-bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  background: #edefec;
  margin-top: 4px;
}
.stack-seg {
  height: 100%;
  min-width: 2px;
}
.stack-legend {
  margin-top: 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}
.legend-val {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
