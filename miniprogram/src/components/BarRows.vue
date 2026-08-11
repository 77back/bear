<script setup lang="ts">
import { computed } from 'vue'

/**
 * BarRows：纯 CSS 水平条形图，替代网页版 EChart 的 hbar/pie。
 * 每行 = 标签 + 条（宽度 = count/max）+ 数值；
 * showPercent 时追加占比（对应网页版饼图的 {d}% 标签，用于题型分布）。
 */

export interface BarRowItem {
  label: string
  count: number
}

const props = withDefaults(
  defineProps<{
    rows: BarRowItem[]
    color?: string
    suffix?: string
    showPercent?: boolean
  }>(),
  { color: 'var(--brand)', suffix: '', showPercent: false }
)

// 大的在上（网页版 echarts 类目轴升序渲染，视觉等价于降序排列）
const sorted = computed(() => [...props.rows].sort((a, b) => b.count - a.count))
const max = computed(() => Math.max(1, ...props.rows.map((r) => r.count)))
const total = computed(() => props.rows.reduce((s, r) => s + r.count, 0))

const width = (c: number) => (c / max.value) * 100
const pct = (c: number) => (total.value ? Math.round((c / total.value) * 1000) / 10 : 0)
</script>

<template>
  <view class="bar-rows">
    <view v-for="r in sorted" :key="r.label" class="bar-row">
      <text class="bar-label">{{ r.label }}</text>
      <view class="bar-track">
        <view class="bar-fill" :style="{ width: width(r.count) + '%', background: color }"></view>
      </view>
      <text class="bar-val">{{ r.count }}{{ suffix }}<text v-if="showPercent"> {{ pct(r.count) }}%</text></text>
    </view>
  </view>
</template>

<style scoped>
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.bar-label {
  width: 96px;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
}
.bar-track {
  flex: 1;
  min-width: 0;
  height: 12px;
  background: #edefec;
  border-radius: 6px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  min-width: 2px;
  border-radius: 6px;
}
.bar-val {
  flex-shrink: 0;
  min-width: 48px;
  text-align: right;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
