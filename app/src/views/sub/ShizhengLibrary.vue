<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { filterShizheng } from '@/core/library'

// 时政库：管线月度累积（content/shizheng/），按月份分区 + 关键词检索
const router = useRouter()
const content = useContentStore()
const keyword = ref('')

onMounted(() => content.loadShizhengAll())

const total = computed(() => content.shizhengMonths.reduce((n, m) => n + m.items.length, 0))

const list = computed(() => filterShizheng(content.shizhengMonths, keyword.value))
</script>

<template>
  <div>
    <div class="page-title">时政库</div>
    <div class="page-sub">
      每日时政自动累积 · 共 {{ total }} 条<template v-if="keyword.trim()"> / 筛选 {{ list.reduce((n, m) => n + m.items.length, 0) }} 条</template>
    </div>

    <template v-if="content.shizhengMonths.length">
      <input v-model="keyword" class="input" style="margin-bottom:10px" placeholder="搜索标题 / 领域 / 解读 / 来源…" />
    </template>

    <div v-if="!content.shizhengMonths.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      时政库积累中 · 每日时政会自动归档到这里
    </div>

    <div v-else-if="!list.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      没有匹配的时政
    </div>

    <div v-for="m in list" :key="m.month" class="card">
      <div class="card-title">{{ m.month.slice(0, 4) }}年{{ Number(m.month.slice(5)) }}月 <span class="more">{{ m.items.length }} 条</span></div>
      <div v-for="(it, i) in m.items" :key="i" style="padding:10px 0;border-top:1px solid var(--line)">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div class="rec-title" style="font-size:14px">{{ it.title }}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:4px">
              {{ it.date || m.month }}
              <template v-if="it.source"> · <a v-if="it.url" :href="it.url" target="_blank" rel="noopener" style="color:inherit">{{ it.source }}</a><span v-else>{{ it.source }}</span></template>
            </div>
          </div>
          <span v-for="d in (it.domains || []).slice(0, 2)" :key="d" class="tag sw">{{ d }}</span>
        </div>
        <div v-if="it.analysis || it.reading" class="rec-body" style="margin-top:6px">解读：{{ it.analysis || it.reading }}</div>
      </div>
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/sw')">返回实务</button>
  </div>
</template>
