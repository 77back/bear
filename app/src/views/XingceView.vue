<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { EChartsOption } from 'echarts'
import { useStatsStore } from '@/stores/stats'
import EChart from '@/components/EChart.vue'

const router = useRouter()
const store = useStatsStore()
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

onMounted(() => store.load())

const RING_R = 40
const RING_C = 2 * Math.PI * RING_R
const ringOffset = computed(() => RING_C * (1 - store.ringPct))

const hasData = computed(() => store.logs.length > 0)

const trendOption = computed<EChartsOption>(() => ({
  grid: { left: 10, right: 18, top: 18, bottom: 22 },
  xAxis: { type: 'category', show: false, data: store.trend.map((t) => t.date) },
  yAxis: { type: 'value', min: 0, max: 1, show: false },
  tooltip: {
    trigger: 'axis',
    formatter: (p: any) =>
      `${p[0].axisValue.slice(5)}　${p[0].data > 0 ? Math.round(p[0].data * 100) + '%' : '无记录'}`
  },
  series: [
    {
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      data: store.trend.map((t) => +(t.rate || 0).toFixed(3)),
      itemStyle: { color: '#4F8A8B' },
      lineStyle: { color: '#4F8A8B', width: 2.5 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: 'rgba(79,138,139,.22)' }, { offset: 1, color: 'rgba(79,138,139,0)' }
        ] }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#C0453E', type: 'dashed', width: 1 },
        data: [{ yAxis: 0.65, label: { formatter: '65%', color: '#C0453E', fontSize: 10 } }]
      }
    }
  ]
}))

function pct(r: number) {
  return Math.round(r * 100) + '%'
}
</script>

<template>
  <div>
    <div class="page-title">行测学习</div>
    <div class="page-sub">打卡驱动 · 进度统计 · 任务规划</div>

    <!-- 周目标环 -->
    <div class="card">
      <div class="card-title">
        本周目标
        <button class="more" @click="showToast(`本周已刷 ${store.weekDone} / ${store.weeklyGoal} 题`)">详情</button>
      </div>
      <div class="ring-wrap">
        <div class="ring">
          <svg width="92" height="92" viewBox="0 0 92 92">
            <circle cx="46" cy="46" :r="RING_R" fill="none" stroke="#EDEFEC" stroke-width="9" />
            <circle
              cx="46" cy="46" :r="RING_R" fill="none" stroke="#4F8A8B" stroke-width="9"
              stroke-linecap="round" :stroke-dasharray="RING_C" :stroke-dashoffset="ringOffset"
              transform="rotate(-90 46 46)"
            />
          </svg>
          <div class="num">
            <b>{{ Math.round(store.ringPct * 100) }}%</b>
            <small>{{ store.weekDone }}/{{ store.weeklyGoal }} 题</small>
          </div>
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;margin-bottom:6px">刷题 {{ store.weeklyGoal }} 道 · {{ store.ringPct >= 1 ? '已达成' : '进行中' }}</div>
          <div style="font-size:12px;color:var(--text-2);line-height:1.7">
            本周已刷 {{ store.weekDone }} 题，环比 {{ store.weekly.momDelta >= 0 ? '+' : '' }}{{ store.weekly.momDelta }}<br />
            <span style="color:var(--brand);font-weight:600" @click="router.push('/xc/quiz')">＋ 录入今日刷题</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 各板块进度 -->
    <div class="card">
      <div class="card-title">各板块进度 <span class="more">近 30 天</span></div>
      <div v-for="m in store.modules" :key="m.module" class="stat-line">
        <span class="stat-name">{{ m.module }}</span>
        <div class="stat-bar bar">
          <i :style="{ width: m.total ? pct(m.rate).replace('%','') + '%' : '0%', background: m.rate < 0.65 && m.total ? 'var(--sw)' : 'var(--xc)' }"></i>
        </div>
        <span class="stat-val">
          {{ m.total ? pct(m.rate) : '—' }}
          <span v-if="store.delta[m.module] > 0" class="trend-up">↑{{ Math.round(store.delta[m.module] * 100) }}</span>
          <span v-else-if="store.delta[m.module] < 0" class="trend-down">↓{{ Math.abs(Math.round(store.delta[m.module] * 100)) }}</span>
        </span>
      </div>
      <div v-if="!hasData" style="font-size:12px;color:var(--text-3);margin-top:6px">暂无数据，去录入一组刷题记录 →</div>
    </div>

    <!-- 趋势 -->
    <div class="card">
      <div class="card-title">近 14 天正确率趋势</div>
      <EChart v-if="hasData" :option="trendOption" :height="140" />
      <div v-else style="font-size:12px;color:var(--text-3)">录入刷题后显示趋势曲线</div>
    </div>

    <!-- 薄弱点 -->
    <div class="card">
      <div class="card-title">薄弱知识点 Top {{ store.weak.length || '' }}</div>
      <div v-if="store.weak.length">
        <div v-for="(w, i) in store.weak" :key="w.name" class="weak-row">
          <span class="weak-rank">{{ i + 1 }}</span>{{ w.name }}
          <span style="margin-left:auto;font-size:12px;color:var(--text-3)">
            {{ w.isModule ? '正确率 ' + pct(w.rate ?? 0) : '出现 ' + w.count + ' 次' }}
          </span>
        </div>
      </div>
      <div v-else style="font-size:12px;color:var(--text-3)">暂无薄弱数据</div>
    </div>

    <!-- 建议 -->
    <div class="card">
      <div class="card-title">下周任务建议</div>
      <div class="advice">{{ store.advice }}</div>
      <button
        class="btn btn-soft"
        style="margin-top:12px"
        :disabled="!hasData"
        @click="showToast('已采纳建议，下周计划已更新')"
      >采纳建议，更新下周计划</button>
    </div>

    <button class="btn btn-primary" style="margin-bottom:12px" @click="router.push('/xc/quiz')">录入今日刷题</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
