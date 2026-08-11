<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { fetchJson } from '@/platform/request'
import BarRows from '@/components/BarRows.vue'
import StackBar from '@/components/StackBar.vue'

/**
 * 考情分析（pages/sub/exam）：真实考试的考情（真题合集 + 一手回忆），不是题库构成。
 * 数据来自内容服务器 content/exam/analysis.json（fetchJson 带离线缓存，失败/旧结构优雅降级）。
 * 图表为纯 CSS 实现（BarRows 水平条形 / StackBar 堆叠条），不引入图表库。
 */

interface CountRow {
  label: string
  count: number
}
interface ValueRow {
  label: string
  value: number
}
interface Round2Post {
  post: string
  items: string[]
}
interface InstitutionBlock {
  name: string
  realQuestions?: number
  boards?: CountRow[]
  kinds?: { kind: string; label: string; count: number }[]
  scoreStructure?: ValueRow[]
  timeStructure?: ValueRow[]
  domains?: CountRow[]
  round2Count?: number
  round2Posts?: Round2Post[]
}
interface ComparisonRow {
  name: string
  structure: string
  duration: string
  feature: string
}
interface Narrative {
  institution: string
  note: string
  sections: { title: string; items: string[] }[]
}
interface ExamAnalysis {
  note?: string
  comparison?: ComparisonRow[]
  institutions?: InstitutionBlock[]
  narratives?: Narrative[]
}

const data = ref<ExamAnalysis | null>(null)
const loading = ref(true)
let requested = false // onShow 会多次触发，只拉一次（对齐网页版 onMounted 语义）

onShow(async () => {
  if (requested) return
  requested = true
  try {
    data.value = await fetchJson<ExamAnalysis>('exam/analysis.json')
  } catch {
    data.value = null // 断网且无缓存：优雅降级
  } finally {
    loading.value = false
  }
})

function goBack() {
  uni.navigateBack()
}

// 旧结构缓存兼容：字段缺失一律按空数组处理，不白屏
const comparison = computed(() => (Array.isArray(data.value?.comparison) ? data.value.comparison : []))
const institutions = computed(() => (Array.isArray(data.value?.institutions) ? data.value.institutions : []))
const narrativeOf = computed(() => {
  const m = new Map<string, Narrative>()
  for (const n of data.value?.narratives ?? []) m.set(n.institution, n)
  return (name: string) => m.get(name)
})

const toRows = (list?: ValueRow[]): CountRow[] => (list ?? []).map((r) => ({ label: r.label, count: r.value }))
const kindRows = (list?: InstitutionBlock['kinds']): CountRow[] => (list ?? []).map((r) => ({ label: r.label, count: r.count }))
</script>

<template>
  <view class="exam-page">
    <!-- 返回栏 -->
    <button class="back-bar" hover-class="none" @click="goBack">‹ 返回</button>
    <view class="page-title">考情分析</view>
    <view class="page-sub">真实考试怎么考、考什么</view>

    <view v-if="loading" class="card" style="text-align:center;color:var(--text-3);font-size:13px">加载中…</view>
    <view v-else-if="!data || !institutions.length" class="card" style="text-align:center;color:var(--text-3);font-size:13px;padding:32px 16px">
      考情数据暂未上线，等内容更新后再来。
    </view>

    <template v-else>
      <!-- 分析口径说明 -->
      <view v-if="data.note" class="exam-note" style="margin-bottom:12px">{{ data.note }}</view>

      <!-- 三家考试对比 -->
      <view v-if="comparison.length" class="card">
        <view class="card-title">三家考试对比</view>
        <view v-for="c in comparison" :key="c.name" class="cmp-row">
          <view class="cmp-name">{{ c.name }}</view>
          <view class="cmp-line"><text class="cmp-label">结构</text>{{ c.structure }}</view>
          <view class="cmp-line"><text class="cmp-label">时长</text>{{ c.duration }}</view>
          <view class="cmp-line"><text class="cmp-label">特点</text>{{ c.feature }}</view>
        </view>
      </view>

      <!-- 机构区块 -->
      <view v-for="ins in institutions" :key="ins.name" class="card">
        <view class="card-title">
          {{ ins.name }}
          <text style="font-size:12px;color:var(--text-3);font-weight:400">
            {{ ins.realQuestions ? `真题统计 ${ins.realQuestions} 题` : '考生一手回忆' }}
          </text>
        </view>
        <view v-if="narrativeOf(ins.name)?.note" class="exam-note">{{ narrativeOf(ins.name)!.note }}</view>

        <!-- 新华社：分值构成（堆叠条）+ 环节时长（无真题分布图） -->
        <template v-if="ins.scoreStructure?.length">
          <view class="chart-cap">分值构成（满分 100）</view>
          <StackBar :rows="ins.scoreStructure!" />
        </template>
        <template v-if="ins.timeStructure?.length">
          <view class="chart-cap">环节时长</view>
          <BarRows :rows="toRows(ins.timeStructure)" color="var(--xc)" suffix=" 分钟" />
        </template>

        <!-- 板块构成（多于一个板块才有意义） -->
        <template v-if="(ins.boards?.length ?? 0) > 1">
          <view class="chart-cap">{{ ins.name === '人民日报' ? '一轮板块构成' : '板块构成' }}</view>
          <BarRows :rows="ins.boards!" />
        </template>

        <!-- 总台：领域分布（重点） -->
        <template v-if="ins.domains?.length">
          <view class="chart-cap">领域分布</view>
          <BarRows :rows="ins.domains!" color="var(--xc)" />
        </template>

        <!-- 题型分布（网页版饼图 → 水平条形 + 占比） -->
        <template v-if="(ins.kinds?.length ?? 0) > 1">
          <view class="chart-cap">题型分布</view>
          <BarRows :rows="kindRows(ins.kinds)" show-percent />
        </template>

        <!-- 人民日报：次轮（回忆版）分岗位 -->
        <template v-if="ins.round2Posts?.length">
          <view class="chart-cap">次轮（回忆版 {{ ins.round2Count }} 题，无标准答案）</view>
          <view v-for="p in ins.round2Posts" :key="p.post" class="post-card">
            <view class="post-name">{{ p.post }}</view>
            <view v-for="(it, i) in p.items" :key="i" class="exam-item">{{ it }}</view>
          </view>
        </template>

        <!-- 考情要点 -->
        <template v-if="narrativeOf(ins.name)?.sections.length">
          <view v-for="sec in narrativeOf(ins.name)!.sections" :key="sec.title" class="exam-sec">
            <view class="exam-sec-title">{{ sec.title }}</view>
            <view v-for="(it, i) in sec.items" :key="i" class="exam-item">{{ it }}</view>
          </view>
        </template>
      </view>
    </template>
  </view>
</template>

<style scoped>
.exam-page {
  padding: 4px 16px 32px;
}
.back-bar {
  margin: 4px 0 2px;
  padding: 4px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-3);
  background: none;
  border: none;
  text-align: left;
}
/* 覆盖 uni 按钮默认样式（背景/边框/圆角） */
.back-bar::after {
  border: none;
}
.chart-cap {
  font-size: 13px;
  color: var(--text-2);
  margin: 14px 0 4px;
  font-weight: 600;
}
.exam-note {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.7;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg);
}
.cmp-row {
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.cmp-row:first-of-type {
  border-top: none;
  padding-top: 0;
}
.cmp-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.cmp-line {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
  display: flex;
  gap: 8px;
}
.cmp-label {
  flex-shrink: 0;
  color: var(--text-3);
  font-size: 12px;
  padding-top: 1px;
  width: 28px;
}
.post-card {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg);
}
.post-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}
.exam-sec {
  margin-top: 14px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
.exam-sec-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.exam-item {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
  padding: 4px 0 4px 14px;
  position: relative;
}
.exam-item::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 12px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand);
}
</style>
