<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import EChart from '@/components/EChart.vue'
import type { EChartsOption } from 'echarts'

/**
 * 考情分析（/exam）：考什么题型、怎么分布。
 * 数据来自管线产物 content/exam/analysis.json（同源托管，失败优雅降级）。
 * 图表走 EChart.vue（echarts/core 按需引入）。
 */

const router = useRouter()
const BASE = import.meta.env.BASE_URL

interface CountRow {
  label: string
  count: number
}
interface InstitutionBlock {
  name: string
  total: number
  boards: CountRow[]
  kinds: { kind: string; label: string; count: number }[]
}
interface Narrative {
  institution: string
  note: string
  sections: { title: string; items: string[] }[]
}
interface ExamAnalysis {
  total: number
  institutions: InstitutionBlock[]
  shizheng: { byMonth: CountRow[]; byDomain: CountRow[] }
  narratives: Narrative[]
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

const narrativeOf = computed(() => {
  const m = new Map<string, Narrative>()
  for (const n of data.value?.narratives ?? []) m.set(n.institution, n)
  return (name: string) => m.get(name)
})

/* ---------- 图表 option（配色沿用 design-tokens） ---------- */
const PALETTE = ['#3e7a5e', '#4f8a8b', '#d4723f', '#c9a227', '#2e5c46', '#93a199']
const AXIS_LABEL = { color: '#6b6560', fontSize: 12 }
const VALUE_LABEL = { show: true, color: '#6b6560', fontSize: 11 }

/** 横向条形图（量大的在上） */
function hbar(rows: CountRow[], color = '#3e7a5e'): EChartsOption {
  const sorted = [...rows].sort((a, b) => a.count - b.count)
  return {
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
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
        label: { ...VALUE_LABEL, position: 'right' }
      }
    ]
  }
}

/** 竖向柱状图（按月等自然顺序） */
function vbar(rows: CountRow[], color = '#3e7a5e'): EChartsOption {
  return {
    grid: { left: 8, right: 8, top: 20, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: AXIS_LABEL
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => r.count),
        barWidth: 22,
        itemStyle: { color, borderRadius: [6, 6, 0, 0] },
        label: { ...VALUE_LABEL, position: 'top' }
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
</script>

<template>
  <div>
    <!-- 返回栏 -->
    <button class="back-bar" @click="router.back()">‹ 返回</button>
    <div class="page-title">考情分析</div>
    <div class="page-sub">
      <template v-if="data">{{ data.total }} 题 · {{ data.institutions.length }} 大来源 · 数据截至题库当前版本</template>
      <template v-else>考什么题型、怎么分布</template>
    </div>

    <div v-if="loading" class="card" style="text-align:center;color:var(--text-3);font-size:13px">加载中…</div>
    <div v-else-if="!data" class="card" style="text-align:center;color:var(--text-3);font-size:13px;padding:32px 16px">
      考情数据暂未上线，等内容更新后再来。
    </div>

    <template v-else>
      <!-- 总览：机构题量占比 -->
      <div class="card">
        <div class="card-title">总览 · 题量分布</div>
        <EChart :option="hbar(data.institutions.map((i) => ({ label: i.name, count: i.total })))" :height="150" />
      </div>

      <!-- 机构区块 -->
      <div v-for="ins in data.institutions" :key="ins.name" class="card">
        <div class="card-title">
          {{ ins.name }}
          <span style="font-size:12px;color:var(--text-3);font-weight:400">{{ ins.total }} 题</span>
        </div>
        <div v-if="narrativeOf(ins.name)?.note" class="exam-note">{{ narrativeOf(ins.name)!.note }}</div>

        <div class="chart-cap">板块构成</div>
        <EChart :option="hbar(ins.boards)" :height="Math.max(110, ins.boards.length * 34)" />
        <div class="chart-cap">题型分布</div>
        <EChart :option="pie(ins.kinds)" :height="210" />

        <!-- 时政押题：按月 / 按领域 -->
        <template v-if="ins.name === '时政押题'">
          <div class="chart-cap">按月分布</div>
          <EChart :option="vbar(data.shizheng.byMonth, '#4f8a8b')" :height="170" />
          <div class="chart-cap">按领域分布</div>
          <EChart :option="hbar(data.shizheng.byDomain, '#4f8a8b')" :height="Math.max(150, data.shizheng.byDomain.length * 30)" />
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
