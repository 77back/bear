<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore, CASE_DOMAINS } from '@/stores/content'
import { filterCases, monthsOf } from '@/core/library'

// 案例库：管线累积归档（content/archive/cases.json），关键词 + 领域 + 月份检索
const router = useRouter()
const content = useContentStore()
const active = ref('全部')
const activeMonth = ref('')
const keyword = ref('')

onMounted(() => content.loadArchive())

// 只列出归档里实际存在的领域，避免一堆空 chip
const domains = computed(() => [
  '全部',
  ...CASE_DOMAINS.filter((d) => content.archive.some((c) => c.domain === d))
])

// 月份 chip：只列实际存在的月份，新→旧
const months = computed(() => monthsOf(content.archive.map((c) => c.date)))

const list = computed(() =>
  filterCases(content.archive, { keyword: keyword.value, domain: active.value, month: activeMonth.value })
)
</script>

<template>
  <div>
    <div class="page-title">案例库</div>
    <div class="page-sub">
      每日案例自动归档累积 · 共 {{ content.archive.length }} 条<template v-if="content.archive.length"> / 当前筛选 {{ list.length }} 条</template>
    </div>

    <template v-if="content.archive.length">
      <input v-model="keyword" class="input" style="margin-bottom:10px" placeholder="搜索标题 / 内容 / 来源…" />

      <div class="chip-row">
        <button
          v-for="d in domains"
          :key="d"
          class="chip"
          :class="{ on: active === d }"
          :style="active === d ? { background: 'var(--sl)' } : {}"
          @click="active = d"
        >{{ d }}</button>
      </div>

      <div class="chip-row">
        <button class="chip" :class="{ on: !activeMonth }" @click="activeMonth = ''">全部月份</button>
        <button
          v-for="m in months"
          :key="m"
          class="chip"
          :class="{ on: activeMonth === m }"
          @click="activeMonth = m"
        >{{ m.slice(0, 4) }}年{{ Number(m.slice(5)) }}月</button>
      </div>
    </template>

    <div v-if="!content.archive.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      案例库积累中 · 每日内容会自动归档到这里
    </div>

    <div v-else-if="!list.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      没有匹配的案例
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
