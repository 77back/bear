<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { usePracticeStore } from '@/stores/practice'
import { getSetting } from '@/db/seed'
import { shizhengPriority } from '@/core/recommend'

const router = useRouter()
const content = useContentStore()
const practice = usePracticeStore()
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
const examDate = ref('2026-11-27')

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

onMounted(async () => {
  examDate.value = await getSetting('examDate', '2026-11-27')
  await practice.load()
  await content.load()
  const month = new Date().toISOString().slice(0, 7)
  await content.loadShizheng(month)
  await content.loadPinglunIndex()
})

const prioritizeShizheng = computed(() => shizhengPriority(examDate.value))

// 评论库筛选
const months = computed(() => [...new Set(content.pinglunIndex.map((p) => p.month))].sort().reverse())
const fields = ['全部领域', '时政', '经济', '文化', '科技', '民生']
const selMonth = ref('')
const selField = ref('全部领域')

const filteredPinglun = computed(() => {
  return content.pinglunIndex.filter((p) => {
    if (selMonth.value && p.month !== selMonth.value) return false
    if (selField.value !== '全部领域' && !(p.domains || []).includes(selField.value)) return false
    return true
  })
})

function toPractice(qtype: string) {
  router.push({ path: '/sw/practice', query: { qtype } })
}
</script>

<template>
  <div>
    <div class="page-title">新闻实务</div>
    <div class="page-sub">统计驱动推荐 · 四大板块</div>

    <!-- 四板块入口 -->
    <div class="grid4">
      <div class="grid-item" @click="showToast('时政政策解读：见下方月度统计')">
        <div class="gicon" style="background:#F9E7DD;color:var(--sw)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg></div>
        <div class="gname">时政政策解读</div>
        <div class="gdesc">月度时政统计 + 专业理论解读</div>
      </div>
      <div class="grid-item" @click="showToast(content.daily?.guoji?.length ? '国际新闻解读' : '国际解读待内容管线')">
        <div class="gicon" style="background:#E7F0F0;color:var(--xc)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></div>
        <div class="gname">国际新闻解读</div>
        <div class="gdesc">重点国外新闻 + 专业视角拆解</div>
      </div>
      <div class="grid-item" @click="toPractice('消息')">
        <div class="gicon" style="background:#F7EFD8;color:#9A7B1A"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></div>
        <div class="gname">实务每日练习</div>
        <div class="gdesc">消息 / 评论 / 采访策划</div>
      </div>
      <div class="grid-item" @click="$el?.querySelector('#pinglun')?.scrollIntoView({behavior:'smooth'})">
        <div class="gicon" style="background:#E4EFEA;color:var(--brand)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.6 8.6 0 01-3.8-.9L3 21l2-5.2a8.4 8.4 0 117-4.3 8.4 8.4 0 019 0z"/></svg></div>
        <div class="gname">评论案例库</div>
        <div class="gdesc">按月归档 · 按领域检索</div>
      </div>
    </div>

    <!-- 每日案例 + 对应练习 -->
    <div v-if="content.daily?.shiwu?.material" class="card rec-card" style="border-left-color:var(--sw)">
      <div class="rec-head"><span class="tag sw">每日案例 + 对应练习</span></div>
      <div class="rec-title">{{ content.daily.shiwu.material.title }}</div>
      <div class="rec-body">{{ content.daily.shiwu.material.body }}</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">
        来源：<a v-if="content.daily.shiwu.material.url" :href="content.daily.shiwu.material.url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ content.daily.shiwu.material.source }}</a><span v-else>{{ content.daily.shiwu.material.source }}</span>
      </div>
      <div class="practice-btns">
        <button v-for="ex in content.daily.shiwu.exercises" :key="ex.qtype" class="pbtn" @click="toPractice(ex.qtype)">{{ ex.qtype }}</button>
      </div>
    </div>

    <!-- 实务推荐（统计驱动） -->
    <div class="card">
      <div class="card-title">练习推荐</div>
      <div class="advice" style="background:#F9E7DD;color:#A34E24">
        近 14 天练习最少的是「{{ practice.recommendQtype }}」题型，建议今日加练 1 个。
        <span style="display:block;margin-top:4px;font-size:11px;opacity:.8">已练 {{ practice.total14 }} 次 · 统计驱动推荐</span>
      </div>
    </div>

    <!-- 时政月统计 -->
    <div v-if="content.shizheng" class="card" :class="{ 'rec-card': prioritizeShizheng }" :style="prioritizeShizheng ? 'border-left-color:var(--sw)' : ''">
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
    </div>

    <!-- 国际新闻解读 -->
    <div v-if="content.daily?.guoji?.length" class="card">
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
      <div class="card-title">评论案例库 <span class="more">{{ filteredPinglun.length }} 篇</span></div>
      <div v-if="months.length" class="chip-row">
        <button class="chip" :class="{ on: !selMonth }" @click="selMonth = ''">全部</button>
        <button v-for="m in months" :key="m" class="chip" :class="{ on: selMonth === m }" @click="selMonth = m">{{ m.slice(5) }}月</button>
      </div>
      <div class="chip-row">
        <button v-for="f in fields" :key="f" class="chip" :class="{ on: selField === f }" @click="selField = f">{{ f }}</button>
      </div>
      <div v-for="p in filteredPinglun" :key="p.id" class="case-row" @click="showToast(p.structure || p.examUse || '查看详情')">
        <span class="case-dot"></span>
        <div>
          <div class="case-title">{{ p.title }}</div>
          <div class="case-meta">{{ p.month }}{{ p.source ? ' · ' + p.source : '' }} · {{ p.structure || '论点结构' }}</div>
        </div>
      </div>
      <div v-if="filteredPinglun.length === 0" style="font-size:12px;color:var(--text-3)">评论库暂无内容</div>
    </div>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
