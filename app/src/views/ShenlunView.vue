<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useReviewStore } from '@/stores/review'
import { useContentStore } from '@/stores/content'
import { STAGE_LABEL } from '@/core/ebbinghaus'
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
})

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

    <!-- 每日案例推荐 -->
    <div class="card" v-if="content.daily?.cases?.length">
      <div class="card-title">每日案例推荐 <button v-if="content.dates.length > 1" class="more" @click="content.nextDaily()">换一批</button></div>
      <div class="rec-title" style="margin-bottom:6px">{{ content.daily.cases[0].title }}</div>
      <div class="rec-body">{{ content.daily.cases[0].summary }}</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">
        来源：<a v-if="content.daily.cases[0].url" :href="content.daily.cases[0].url" target="_blank" rel="noopener" style="color:var(--text-3)">{{ content.daily.cases[0].source }}</a><span v-else>{{ content.daily.cases[0].source }}</span>
      </div>
      <div class="rec-foot">
        <span v-for="t in content.daily.cases[0].themes" :key="t" class="tag sl">{{ t }}</span>
        <span style="margin-left:auto;font-size:12px;color:var(--brand);font-weight:600;cursor:pointer;padding:4px 0" @click="collectCase">＋ 收藏进素材库</span>
      </div>
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
      <div class="card-title">每日文章推荐</div>
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

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
