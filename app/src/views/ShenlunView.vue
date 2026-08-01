<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useReviewStore } from '@/stores/review'
import { useContentStore } from '@/stores/content'
import { STAGE_LABEL } from '@/core/ebbinghaus'
import { pickCaseRec } from '@/core/library'
import type { ReviewStage } from '@/db'

const router = useRouter()
const review = useReviewStore()
const content = useContentStore()
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

onMounted(() => {
  review.load()
  content.load()
  content.loadArchive() // 案例库入口计数用；无此文件时静默为空
})

// 每日三件套（旧内容包无 shenlun 字段 → 整卡隐藏）
const shenlun = computed(() => content.daily?.shenlun)
const hasShenlun = computed(
  () => !!(shenlun.value && (shenlun.value.sentence || shenlun.value.title || shenlun.value.case))
)

// 每日案例推荐：当日包 cases 为空时从案例库兜底（按日期确定性轮换选 5 条）
const archiveOffset = ref(0)
const caseRec = computed(() =>
  pickCaseRec(content.daily?.cases, content.archive, content.latest, archiveOffset.value)
)
const dailyCases = computed(() => (caseRec.value.mode === 'daily' ? caseRec.value.items : []))
const archiveCases = computed(() => (caseRec.value.mode === 'archive' ? caseRec.value.items : []))
// 换一批（两种模式统一入口）：当日包模式切换日期包；兜底模式步进 +5 轮换案例库
const canNextBatch = computed(() =>
  caseRec.value.mode === 'daily' ? content.dates.length > 1 : content.archive.length > 5
)
function nextBatch() {
  if (caseRec.value.mode === 'daily') content.nextDaily()
  else archiveOffset.value += 5
}

// 翻面状态：已翻开的复习卡 id 集合
const revealed = ref<Set<number>>(new Set())
function flip(id: number) {
  const s = new Set(revealed.value)
  s.has(id) ? s.delete(id) : s.add(id)
  revealed.value = s
}

const dueWithMaterial = computed(() =>
  review.due.map((r) => ({ r, m: review.materialOf(r.materialId) })).filter((x) => x.m)
)

async function completeReview(id: number) {
  const archived = await review.complete(id)
  revealed.value.delete(id)
  revealed.value = new Set(revealed.value)
  if (archived) showToast('复习全部完成，已纳入案例库 ✓')
  else showToast(review.dueCount === 0 ? '今日复习已全部完成 ✓' : `还剩 ${review.dueCount} 项待复习`)
}

async function collectCase() {
  const c = content.daily?.cases?.[0]
  if (!c) return
  await review.collect({
    type: 'case',
    title: c.title,
    body: c.summary,
    domains: c.themes,
    usage: c.usage,
    source: c.source
  })
  showToast('已收藏，将按遗忘曲线推送复习')
}

async function collectArticle() {
  const a = content.daily?.article
  if (!a) return
  await review.collect({
    type: 'article',
    title: a.title,
    body: a.quotes.join('；') || a.structure.join('；'),
    domains: [],
    source: a.source
  })
  showToast('已加入素材库')
}

const stages = computed(() =>
  (Object.keys(review.buckets) as unknown as ReviewStage[])
    .map((k) => Number(k) as ReviewStage)
    .filter((s) => review.buckets[s] > 0)
)
</script>

<template>
  <div>
    <div class="page-title">申论学习</div>
    <div class="page-sub">案例推荐 · 科学复习 · 每日积累</div>

    <!-- 今日复习（遮挡自测） -->
    <div class="card">
      <div class="card-title">
        今日复习
        <span class="tag sl" style="margin-left:auto">待复习 {{ review.dueCount }} 项</span>
      </div>

      <div v-if="dueWithMaterial.length === 0" style="font-size:13px;color:var(--text-3);padding:8px 0">
        今日无到期复习。收藏案例后将按 1/3/7/15 天自动推送。
      </div>

      <div v-for="{ r, m } in dueWithMaterial" :key="r.id" class="flip-card" style="margin-bottom:10px">
        <template v-if="!revealed.has(r.id!)">
          <div class="flip-q">看主题，回忆案例 →</div>
          <div class="flip-hint">主题：{{ m!.title }}（{{ STAGE_LABEL[r.stage] }}复习）</div>
          <button class="btn" style="background:#fff;color:#9A7B1A;border:1.5px solid #EBDDAF;min-height:44px" @click="flip(r.id!)">点击翻面看答案</button>
        </template>
        <template v-else>
          <div class="flip-q">{{ m!.title }}</div>
          <div class="rec-body" style="margin:6px 0 12px">{{ m!.body }}</div>
          <div v-if="m!.usage" style="font-size:12px;color:#9A7B1A;margin-bottom:10px">用法：{{ m!.usage }}</div>
          <button class="btn" style="background:#fff;color:var(--brand);border:1.5px solid var(--brand);min-height:44px" @click="completeReview(r.id!)">复习完成</button>
        </template>
      </div>

      <div v-if="stages.length" style="display:flex;gap:8px;font-size:12px;color:var(--text-3);flex-wrap:wrap">
        <span v-for="s in stages" :key="s" class="tag brand">{{ STAGE_LABEL[s] }} · {{ review.buckets[s] }}项</span>
      </div>
    </div>

    <!-- 每日三件套（好句子/好标题/好案例；为空时整卡隐藏） -->
    <div class="card" v-if="hasShenlun">
      <div class="card-title">每日三件套 <span class="more">{{ content.latest }}</span></div>
      <div v-if="shenlun?.sentence" style="display:flex;gap:8px;padding:7px 0;align-items:flex-start">
        <span class="tag sl" style="flex-shrink:0;margin-top:2px">好句子</span>
        <span style="font-size:14px;line-height:1.7">{{ shenlun.sentence }}</span>
      </div>
      <div v-if="shenlun?.title" style="display:flex;gap:8px;padding:7px 0;align-items:flex-start">
        <span class="tag sl" style="flex-shrink:0;margin-top:2px">好标题</span>
        <span style="font-size:14px;line-height:1.7">{{ shenlun.title }}</span>
      </div>
      <div v-if="shenlun?.case" style="display:flex;gap:8px;padding:7px 0;align-items:flex-start">
        <span class="tag sl" style="flex-shrink:0;margin-top:2px">好案例</span>
        <span style="font-size:14px;line-height:1.7">{{ shenlun.case }}</span>
      </div>
    </div>

    <!-- 每日案例推荐（当日包 cases 为空时从案例库兜底） -->
    <div class="card" v-if="dailyCases.length || archiveCases.length">
      <div class="card-title">
        每日案例推荐
        <span v-if="dailyCases.length && dailyCases[0].domain" class="tag sl" style="margin-left:4px">{{ dailyCases[0].domain }}</span>
        <button v-if="canNextBatch" class="more" @click="nextBatch()">换一批</button>
      </div>
      <template v-if="dailyCases.length">
        <div class="rec-title" style="margin-bottom:6px">{{ dailyCases[0].title }}</div>
        <div class="rec-body">{{ dailyCases[0].summary }}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:6px">
          来源：<a v-if="dailyCases[0].url" :href="dailyCases[0].url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ dailyCases[0].source }}</a><span v-else>{{ dailyCases[0].source }}</span>
        </div>
        <div class="rec-foot">
          <span v-for="t in dailyCases[0].themes" :key="t" class="tag sl">{{ t }}</span>
          <span style="margin-left:auto;font-size:12px;color:var(--brand);font-weight:600;cursor:pointer;padding:4px 0" @click="collectCase">＋ 收藏进素材库</span>
        </div>
      </template>
      <template v-else>
        <div v-for="(c, i) in archiveCases" :key="c.id" :style="i > 0 ? 'border-top:1px solid var(--line);padding-top:10px;margin-top:10px' : ''">
          <div class="rec-title" style="margin-bottom:6px">{{ c.title }}</div>
          <div class="rec-body">{{ c.text }}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:6px">
            来源：<a v-if="c.url" :href="c.url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ c.source }}</a><span v-else>{{ c.source }}</span>
          </div>
          <div class="rec-foot">
            <span class="tag sl">{{ c.domain }}</span>
            <span style="margin-left:auto;font-size:12px;color:var(--text-3)">来自案例库</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 文章结构推荐 -->
    <div class="card" v-if="content.daily?.structure">
      <div class="card-title">文章结构推荐</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">{{ content.daily.structure.name }}</div>
      <div class="structure">
        <template v-for="(n, i) in content.daily.structure.nodes" :key="i">
          <span class="node">{{ n }}</span>
          <span v-if="i < content.daily.structure.nodes.length - 1" class="arrow">→</span>
        </template>
      </div>
      <div class="rec-body">{{ content.daily.structure.fragment }}</div>
    </div>

    <!-- 每日文章推荐 -->
    <div class="card" v-if="content.daily?.article?.title">
      <div class="card-title">
        每日文章推荐
        <span v-if="content.daily.article.domain" class="tag sl" style="margin-left:auto">{{ content.daily.article.domain }}</span>
      </div>
      <div class="article-card">
        <div class="article-cover">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4a2 2 0 00-2-2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>
        </div>
        <div class="article-info">
          <div class="article-title">{{ content.daily.article.title }}</div>
          <div class="article-meta"><a v-if="content.daily.article.url" :href="content.daily.article.url" target="_blank" rel="noopener" style="color:inherit">{{ content.daily.article.source }}</a><span v-else>{{ content.daily.article.source }}</span><br />金句：{{ content.daily.article.quotes[0] || '—' }}</div>
        </div>
      </div>
      <button class="btn btn-soft" style="margin-top:12px;background:#F7EFD8;color:#9A7B1A" @click="collectArticle">收藏进素材库</button>
    </div>

    <!-- 素材库入口 -->
    <div class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer" @click="router.push('/sl/material/0')">
      <div style="width:40px;height:40px;border-radius:12px;background:#F7EFD8;display:flex;align-items:center;justify-content:center;color:#9A7B1A;flex-shrink:0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
      </div>
      <div style="flex:1"><div style="font-size:15px;font-weight:600">我的素材库</div><div style="font-size:12px;color:var(--text-3);margin-top:2px">{{ review.collectedCount }} 个素材 · 按主题检索</div></div>
      <span style="color:var(--text-3)">›</span>
    </div>

    <!-- 案例库入口（管线累积归档，按领域浏览） -->
    <div class="card" style="display:flex;align-items:center;gap:12px;cursor:pointer" @click="router.push('/sl/cases')">
      <div style="width:40px;height:40px;border-radius:12px;background:#F7EFD8;display:flex;align-items:center;justify-content:center;color:#9A7B1A;flex-shrink:0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4a2 2 0 00-2-2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>
      </div>
      <div style="flex:1"><div style="font-size:15px;font-weight:600">案例库</div><div style="font-size:12px;color:var(--text-3);margin-top:2px">{{ content.archive.length }} 个案例 · 按领域浏览</div></div>
      <span style="color:var(--text-3)">›</span>
    </div>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
