<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useReviewStore } from '@/stores/review'
import type { MaterialType } from '@/db'

const router = useRouter()
const review = useReviewStore()

const filters: { key: MaterialType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'case', label: '案例' },
  { key: 'structure', label: '结构' },
  { key: 'article', label: '文章' },
  { key: 'pinglun', label: '评论' }
]
const active = ref<MaterialType | 'all'>('all')
const expanded = ref<number | null>(null)

const list = computed(() =>
  active.value === 'all' ? review.materials : review.materials.filter((m) => m.type === active.value)
)

/** 分组：复习中 / 案例库（复习走完已归档，仍可展开回查） */
const groups = computed(() =>
  [
    { label: '复习中', items: list.value.filter((m) => !m.archived) },
    { label: '案例库 · 已归档', items: list.value.filter((m) => m.archived) }
  ].filter((g) => g.items.length)
)

const typeLabel: Record<MaterialType, string> = { case: '案例', structure: '结构', article: '文章', pinglun: '评论' }
const typeTag: Record<MaterialType, string> = { case: 'sl', structure: 'sl', article: 'sl', pinglun: 'sl' }

onMounted(() => review.load())

function toggle(id: number) {
  expanded.value = expanded.value === id ? null : id
}
</script>

<template>
  <div>
    <div class="page-title">我的素材库</div>
    <div class="page-sub">{{ review.collectedCount }} 个素材 · 按主题检索</div>

    <div class="chip-row">
      <button
        v-for="f in filters"
        :key="f.key"
        class="chip"
        :class="{ on: active === f.key }"
        :style="active === f.key ? { background: 'var(--sl)' } : {}"
        @click="active = f.key"
      >{{ f.label }}</button>
    </div>

    <div v-if="groups.length === 0" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      还没有素材。去申论页收藏每日案例/文章吧。
    </div>

    <template v-for="g in groups" :key="g.label">
      <div style="font-size:12px;color:var(--text-3);margin:12px 4px 8px">{{ g.label }} · {{ g.items.length }}</div>
      <div v-for="m in g.items" :key="m.id" class="card">
        <div style="display:flex;align-items:flex-start;gap:8px;cursor:pointer" @click="toggle(m.id!)">
          <div style="flex:1">
            <div class="rec-title">{{ m.title }}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:4px">{{ m.source }} · 收藏于 {{ new Date(m.collectedAt).toLocaleDateString() }}</div>
          </div>
          <span v-if="m.archived" class="tag" style="background:#E7F0EA;color:var(--brand)">已归档</span>
          <span class="tag" :class="typeTag[m.type]">{{ typeLabel[m.type] }}</span>
        </div>
        <div v-if="expanded === m.id" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
          <div class="rec-body">{{ m.body }}</div>
          <div v-if="m.usage" style="font-size:12px;color:#9A7B1A;margin-top:8px">用法：{{ m.usage }}</div>
          <div v-if="m.domains.length" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <span v-for="d in m.domains" :key="d" class="tag sl">{{ d }}</span>
          </div>
        </div>
      </div>
    </template>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/sl')">返回申论</button>
  </div>
</template>
