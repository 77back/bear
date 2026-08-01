<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore, CASE_DOMAINS } from '@/stores/content'

// 案例库：管线累积归档（content/archive/cases.json），按领域筛选浏览
const router = useRouter()
const content = useContentStore()
const active = ref('全部')

onMounted(() => content.loadArchive())

// 只列出归档里实际存在的领域，避免一堆空 chip
const domains = computed(() => [
  '全部',
  ...CASE_DOMAINS.filter((d) => content.archive.some((c) => c.domain === d))
])

const list = computed(() =>
  active.value === '全部' ? content.archive : content.archive.filter((c) => c.domain === active.value)
)
</script>

<template>
  <div>
    <div class="page-title">案例库</div>
    <div class="page-sub">每日案例自动归档累积 · 按领域浏览</div>

    <div class="chip-row" v-if="content.archive.length">
      <button
        v-for="d in domains"
        :key="d"
        class="chip"
        :class="{ on: active === d }"
        :style="active === d ? { background: 'var(--sl)' } : {}"
        @click="active = d"
      >{{ d }}</button>
    </div>

    <div v-if="!content.archive.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      案例库积累中 · 每日内容会自动归档到这里
    </div>

    <div v-for="c in list" :key="c.id" class="card">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div class="rec-title">{{ c.title }}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px">
            <a v-if="c.url" :href="c.url" target="_blank" rel="noopener" style="color:inherit">{{ c.source }}</a><span v-else>{{ c.source }}</span>
            · {{ c.date }}
          </div>
        </div>
        <span class="tag sl">{{ c.domain }}</span>
      </div>
      <div class="rec-body" style="margin-top:8px">{{ c.text }}</div>
      <div v-if="c.url" style="margin-top:8px">
        <a :href="c.url" target="_blank" rel="noopener" style="font-size:12px;color:#9A7B1A;font-weight:600">查看原文 →</a>
      </div>
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/sl')">返回申论</button>
  </div>
</template>
