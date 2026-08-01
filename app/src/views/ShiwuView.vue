<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore, type PinglunEntry, type PinglunDetail } from '@/stores/content'
import { getSetting } from '@/db/seed'
import { shizhengPriority } from '@/core/recommend'
import { filterPinglun, pickDailyKnowledge } from '@/core/library'

const router = useRouter()
const content = useContentStore()
const examDate = ref('2026-11-27')

onMounted(async () => {
  examDate.value = await getSetting('examDate', '2026-11-27')
  await content.load()
  const month = new Date().toISOString().slice(0, 7)
  await content.loadShizheng(month)
  await content.loadPinglunIndex()
  await content.loadKnowledge()
})

const prioritizeShizheng = computed(() => shizhengPriority(examDate.value))

// 每日纠错知识点：按当年第几天确定性轮换（当天刷新不变）
const todayStr = (() => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})()
const dailyKnowledge = computed(() => pickDailyKnowledge(content.knowledge, todayStr))

// 评论库筛选
const months = computed(() => [...new Set(content.pinglunIndex.map((p) => p.month))].sort().reverse())
const fields = ['全部领域', '时政', '经济', '文化', '科技', '民生']
const selMonth = ref('')
const selField = ref('全部领域')
const pinglunKw = ref('')

const filteredPinglun = computed(() =>
  filterPinglun(content.pinglunIndex, { keyword: pinglunKw.value, month: selMonth.value, domain: selField.value })
)

function toShizhengLibrary() {
  router.push('/sw/shizheng')
}

/** 平滑滚动到页内区块 */
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// 评论库行内展开：url 在详情包里，展开时按需拉取并缓存
const expandedId = ref<string | null>(null)
const pinglunDetails = ref<Record<string, PinglunDetail | null>>({})

async function togglePinglun(p: PinglunEntry) {
  if (expandedId.value === p.id) {
    expandedId.value = null
    return
  }
  expandedId.value = p.id
  if (!(p.id in pinglunDetails.value)) {
    pinglunDetails.value[p.id] = await content.loadPinglunDetail(p.month, p.id)
  }
}

/** examUse 兼容字符串/数组两种产出形态 */
function fmtExamUse(v: PinglunEntry['examUse']): string {
  return Array.isArray(v) ? v.join('；') : v
}
</script>

<template>
  <div>
    <div class="page-title">新闻实务</div>
    <div class="page-sub">统计驱动推荐 · 四大板块</div>

    <!-- 四板块入口 -->
    <div class="grid4">
      <div v-if="content.shizheng" class="grid-item" @click="toShizhengLibrary">
        <div class="gicon" style="background:#F9E7DD;color:var(--sw)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg></div>
        <div class="gname">时政政策解读</div>
        <div class="gdesc">时政库 · 月度统计 + 解读</div>
      </div>
      <div v-if="content.daily?.guoji?.length" class="grid-item" @click="scrollTo('guoji')">
        <div class="gicon" style="background:#E7F0F0;color:var(--xc)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></div>
        <div class="gname">国际新闻解读</div>
        <div class="gdesc">重点国外新闻 + 专业视角拆解</div>
      </div>
      <div class="grid-item" @click="scrollTo('pinglun')">
        <div class="gicon" style="background:#E4EFEA;color:var(--brand)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.6 8.6 0 01-3.8-.9L3 21l2-5.2a8.4 8.4 0 117-4.3 8.4 8.4 0 019 0z"/></svg></div>
        <div class="gname">评论案例库</div>
        <div class="gdesc">按月归档 · 按领域检索</div>
      </div>
    </div>

    <!-- 每日消息 -->
    <div v-if="content.daily?.shiwu?.material" class="card rec-card" style="border-left-color:var(--sw)">
      <div class="rec-head"><span class="tag sw">每日消息</span></div>
      <div class="rec-title">{{ content.daily.shiwu.material.title }}</div>
      <div class="rec-body">{{ content.daily.shiwu.material.body }}</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">
        来源：<a v-if="content.daily.shiwu.material.url" :href="content.daily.shiwu.material.url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ content.daily.shiwu.material.source }}</a><span v-else>{{ content.daily.shiwu.material.source }}</span>
        <a v-if="content.daily.shiwu.material.url" :href="content.daily.shiwu.material.url" target="_blank" rel="noopener" style="color:var(--brand);margin-left:8px">查看原文 →</a>
      </div>
    </div>

    <!-- 每日纠错知识点 -->
    <div v-if="dailyKnowledge" class="card">
      <div class="card-title">每日纠错 <span class="more">第 {{ dailyKnowledge.index }}/{{ content.knowledge.length }} 条</span></div>
      <div class="rec-title" style="font-size:14px">{{ dailyKnowledge.item.point }}</div>
      <div class="rec-body" style="background:#F9E7DD;margin-top:6px">错误：{{ dailyKnowledge.item.wrong }}</div>
      <div class="rec-body" style="background:#E4EFEA;margin-top:6px">正确：{{ dailyKnowledge.item.right }}</div>
      <div style="font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.7">{{ dailyKnowledge.item.note }}</div>
    </div>

    <!-- 时政月统计 -->
    <div v-if="content.shizheng" id="shizheng" class="card" :class="{ 'rec-card': prioritizeShizheng }" :style="prioritizeShizheng ? 'border-left-color:var(--sw)' : ''">
      <div class="card-title">
        {{ content.shizheng.month }} 时政知识点
        <span v-if="prioritizeShizheng" class="tag sw" style="margin-left:auto">距考&lt;30天 · 置顶</span>
        <span v-else class="more">{{ content.shizheng.items.length }} 条</span>
      </div>
      <div v-for="(it, i) in content.shizheng.items.slice(0, 8)" :key="i" class="sz-row">
        <span class="sz-num">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="sz-name">{{ it.title }}<span v-if="it.source" style="font-size:11px;color:var(--text-3)"> · {{ it.source }}</span></span>
        <span v-if="it.points.length" class="sz-heat">{{ it.points.length }} 点</span>
      </div>
      <div v-if="content.shizheng.items.length === 0" style="font-size:12px;color:var(--text-3)">本月暂无时政统计</div>
      <div style="margin-top:10px;text-align:right">
        <span style="font-size:12px;color:var(--sw);font-weight:600;cursor:pointer" @click="toShizhengLibrary">进入时政库 →</span>
      </div>
    </div>

    <!-- 国际新闻解读 -->
    <div v-if="content.daily?.guoji?.length" id="guoji" class="card">
      <div class="card-title">国际新闻解读</div>
      <div v-for="(g, i) in content.daily.guoji" :key="i">
        <div class="rec-title" style="font-size:14px">{{ g.title }}</div>
        <ul style="margin:4px 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
          <li v-for="(p, j) in g.points.slice(0,3)" :key="j">{{ p }}</li>
        </ul>
        <div v-if="g.reading" class="rec-body" style="background:#E7F0F0;padding:8px 10px;border-radius:8px">{{ g.reading }}</div>
        <div style="font-size:12px;color:var(--text-3);margin:4px 0 10px">
          来源：<a v-if="g.url" :href="g.url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ g.source }}</a><span v-else>{{ g.source }}</span>
        </div>
      </div>
    </div>

    <!-- 评论案例库 -->
    <div id="pinglun" class="card">
      <div class="card-title">评论案例库 <span class="more">共 {{ content.pinglunIndex.length }} 篇 / 筛选 {{ filteredPinglun.length }} 篇</span></div>
      <input v-model="pinglunKw" class="input" style="margin-bottom:10px" placeholder="搜索标题 / 结构 / 考用 / 来源…" />
      <div v-if="months.length" class="chip-row">
        <button class="chip" :class="{ on: !selMonth }" @click="selMonth = ''">全部</button>
        <button v-for="m in months" :key="m" class="chip" :class="{ on: selMonth === m }" @click="selMonth = m">{{ m.slice(5) }}月</button>
      </div>
      <div class="chip-row">
        <button v-for="f in fields" :key="f" class="chip" :class="{ on: selField === f }" @click="selField = f">{{ f }}</button>
      </div>
      <div v-for="p in filteredPinglun" :key="p.id" class="case-row" @click="togglePinglun(p)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">{{ p.title }}</div>
          <div class="case-meta">{{ p.month }}{{ p.source ? ' · ' + p.source : '' }} · {{ p.structure || '论点结构' }}</div>
          <div v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <div v-if="p.structure" class="rec-body">结构：{{ p.structure }}</div>
            <div v-if="fmtExamUse(p.examUse)" style="font-size:12px;color:#A34E24;margin-top:6px">考用：{{ fmtExamUse(p.examUse) }}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:6px">
              来源：{{ p.source || '—' }}
              <a v-if="pinglunDetails[p.id]?.url" :href="pinglunDetails[p.id]!.url" target="_blank" rel="noopener" style="color:var(--brand);margin-left:8px" @click.stop>查看原文</a>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredPinglun.length === 0" style="font-size:12px;color:var(--text-3)">
        {{ content.pinglunIndex.length ? '没有匹配的评论' : '评论库暂无内容' }}
      </div>
    </div>
  </div>
</template>
