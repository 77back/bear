<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import EChart from '@/components/EChart.vue'
import type { EChartsOption } from 'echarts'

/**
 * 考情分析（/exam）：真实考试的考情（真题合集 + 一手回忆），不是题库构成。
 * 数据来自管线产物 content/exam/analysis.json（同源托管，失败/旧结构优雅降级）。
 * 图表走 EChart.vue（echarts/core 按需引入）。
 */

const router = useRouter()
const BASE = import.meta.env.BASE_URL

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

onMounted(async () => {
  try {
    const r = await fetch(`${BASE}content/exam/analysis.json`)
    if (!r.ok) throw new Error(`${r.status}`)
    data.value = (await r.json()) as ExamAnalysis
  } catch {
    data.value = null // 旧部署/断网：优雅降级
  } finally {
    loading.value = false
  }
})

// 旧结构缓存兼容：字段缺失一律按空数组处理，不白屏
const comparison = computed(() => (Array.isArray(data.value?.comparison) ? data.value.comparison : []))
const institutions = computed(() => (Array.isArray(data.value?.institutions) ? data.value.institutions : []))
const narrativeOf = computed(() => {
  const m = new Map<string, Narrative>()
  for (const n of data.value?.narratives ?? []) m.set(n.institution, n)
  return (name: string) => m.get(name)
})

/* ---------- 图表 option（配色沿用 design-tokens） ---------- */
const PALETTE = ['#3e7a5e', '#4f8a8b', '#d4723f', '#c9a227', '#2e5c46', '#93a199']
const AXIS_LABEL = { color: '#6b6560', fontSize: 12 }

/** 横向条形图（量大的在上），suffix 为数值单位（分/分钟） */
function hbar(rows: CountRow[], color = '#3e7a5e', suffix = ''): EChartsOption {
  const sorted = [...rows].sort((a, b) => a.count - b.count)
  return {
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: sorted.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: AXIS_LABEL
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((r) => r.count),
        barWidth: 12,
        itemStyle: { color, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: '#6b6560', fontSize: 11, formatter: `{c}${suffix}` }
      }
    ]
  }
}

/** 饼图（题型分布） */
function pie(rows: CountRow[]): EChartsOption {
  return {
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: AXIS_LABEL, icon: 'circle' },
    series: [
      {
        type: 'pie',
        radius: ['38%', '62%'],
        center: ['50%', '44%'],
        data: rows.map((r, i) => ({
          name: r.label,
          value: r.count,
          itemStyle: { color: PALETTE[i % PALETTE.length] }
        })),
        label: { show: true, formatter: '{d}%', fontSize: 11, color: '#6b6560' },
        itemStyle: { borderColor: '#fff', borderWidth: 2 }
      }
    ]
  }
}

const toRows = (list?: ValueRow[]): CountRow[] => (list ?? []).map((r) => ({ label: r.label, count: r.value }))
</script>

<template>
  <div>
    <!-- 返回栏 -->
    <button class="back-bar" @click="router.back()">‹ 返回</button>
    <div class="page-title">考情分析</div>
    <div class="page-sub">真实考试怎么考、考什么</div>

    <div v-if="loading" class="card" style="text-align:center;color:var(--text-3);font-size:13px">加载中…</div>
    <div v-else-if="!data || !institutions.length" class="card" style="text-align:center;color:var(--text-3);font-size:13px;padding:32px 16px">
      考情数据暂未上线，等内容更新后再来。
    </div>

    <template v-else>
      <!-- 分析口径说明 -->
      <div v-if="data.note" class="exam-note" style="margin-bottom:12px">{{ data.note }}</div>

      <!-- 三家考试对比 -->
      <div v-if="comparison.length" class="card">
        <div class="card-title">三家考试对比</div>
        <div v-for="c in comparison" :key="c.name" class="cmp-row">
          <div class="cmp-name">{{ c.name }}</div>
          <div class="cmp-line"><span class="cmp-label">结构</span>{{ c.structure }}</div>
          <div class="cmp-line"><span class="cmp-label">时长</span>{{ c.duration }}</div>
          <div class="cmp-line"><span class="cmp-label">特点</span>{{ c.feature }}</div>
        </div>
      </div>

      <!-- 机构区块 -->
      <div v-for="ins in institutions" :key="ins.name" class="card">
        <div class="card-title">
          {{ ins.name }}
          <span style="font-size:12px;color:var(--text-3);font-weight:400">
            {{ ins.realQuestions ? `真题统计 ${ins.realQuestions} 题` : '考生一手回忆' }}
          </span>
        </div>
        <div v-if="narrativeOf(ins.name)?.note" class="exam-note">{{ narrativeOf(ins.name)!.note }}</div>

        <!-- 新华社：分值构成 + 环节时长（无真题分布图） -->
        <template v-if="ins.scoreStructure?.length">
          <div class="chart-cap">分值构成（满分 100）</div>
          <EChart :option="hbar(toRows(ins.scoreStructure), '#3e7a5e', ' 分')" :height="Math.max(110, ins.scoreStructure.length * 34)" />
        </template>
        <template v-if="ins.timeStructure?.length">
          <div class="chart-cap">环节时长</div>
          <EChart :option="hbar(toRows(ins.timeStructure), '#4f8a8b', ' 分钟')" :height="Math.max(90, ins.timeStructure.length * 40)" />
        </template>

        <!-- 板块构成（多于一个板块才有意义） -->
        <template v-if="(ins.boards?.length ?? 0) > 1">
          <div class="chart-cap">{{ ins.name === '人民日报' ? '一轮板块构成' : '板块构成' }}</div>
          <EChart :option="hbar(ins.boards!)" :height="Math.max(110, ins.boards!.length * 34)" />
        </template>

        <!-- 总台：领域分布（重点） -->
        <template v-if="ins.domains?.length">
          <div class="chart-cap">领域分布</div>
          <EChart :option="hbar(ins.domains!, '#4f8a8b')" :height="Math.max(110, ins.domains!.length * 34)" />
        </template>

        <!-- 题型分布 -->
        <template v-if="(ins.kinds?.length ?? 0) > 1">
          <div class="chart-cap">题型分布</div>
          <EChart :option="pie(ins.kinds!)" :height="210" />
        </template>

        <!-- 人民日报：次轮（回忆版）分岗位 -->
        <template v-if="ins.round2Posts?.length">
          <div class="chart-cap">次轮（回忆版 {{ ins.round2Count }} 题，无标准答案）</div>
          <div v-for="p in ins.round2Posts" :key="p.post" class="post-card">
            <div class="post-name">{{ p.post }}</div>
            <div v-for="(it, i) in p.items" :key="i" class="exam-item">{{ it }}</div>
          </div>
        </template>

        <!-- 考情要点 -->
        <template v-if="narrativeOf(ins.name)?.sections.length">
          <div v-for="sec in narrativeOf(ins.name)!.sections" :key="sec.title" class="exam-sec">
            <div class="exam-sec-title">{{ sec.title }}</div>
            <div v-for="(it, i) in sec.items" :key="i" class="exam-item">{{ it }}</div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.back-bar {
  margin: 4px 0 2px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--text-3);
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
