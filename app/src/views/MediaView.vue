<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useContentStore } from '@/stores/content'
import {
  filterMediaOrgs,
  filterMediaKnowledge,
  filterMediaPlans,
  filterMediaReports
} from '@/core/library'

const content = useContentStore()

onMounted(async () => {
  await content.loadMedia()
})

// 五分区：纯只读信息搜集展示，不出题
const sections = [
  { key: 'orgs', label: '机构常识' },
  { key: 'knowledge', label: '媒体常识' },
  { key: 'plans-i', label: '采访策划' },
  { key: 'plans-r', label: '报道策划' },
  { key: 'reports', label: '调研报告' }
] as const
type SectionKey = (typeof sections)[number]['key']
const active = ref<SectionKey>('orgs')

// 顶部关键词搜索：跨分区；有关键词时展示所有命中的分区
const kw = ref('')
const searching = computed(() => kw.value.trim().length > 0)

// 机构常识：机构 chip 筛选
const orgNames = computed(() => [...new Set(content.mediaOrgs.map((o) => o.org))])
const selOrg = ref('全部')
const orgs = computed(() => filterMediaOrgs(content.mediaOrgs, { keyword: kw.value, org: selOrg.value }))

const knowledge = computed(() => filterMediaKnowledge(content.mediaKnowledge, kw.value))
const interviewPlans = computed(() =>
  filterMediaPlans(content.mediaPlans, { keyword: kw.value, type: '采访策划' })
)
const reportPlans = computed(() =>
  filterMediaPlans(content.mediaPlans, { keyword: kw.value, type: '报道策划' })
)
const reports = computed(() => filterMediaReports(content.mediaReports, kw.value))

/** 某分区当前是否展示（搜索时只显示有命中的分区） */
function showSection(key: SectionKey, count: number): boolean {
  if (!searching.value) return active.value === key
  return count > 0
}

// 行内展开详情（各分区共用，id 全局唯一）
const expandedId = ref<string | null>(null)
function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div>
    <div class="page-title">媒体备考</div>
    <div class="page-sub">信息搜集展示 · 不出题</div>

    <input v-model="kw" class="input" style="margin-bottom:10px" placeholder="跨分区搜索：机构 / 话题 / 关键词…" />

    <div v-if="!searching" class="chip-row" style="margin-bottom:12px">
      <button
        v-for="s in sections"
        :key="s.key"
        class="chip"
        :class="{ on: active === s.key }"
        @click="active = s.key"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- 机构常识 -->
    <div v-if="showSection('orgs', orgs.length)" class="card">
      <div class="card-title">机构常识 <span class="more">{{ orgs.length }} 条</span></div>
      <div v-if="orgNames.length" class="chip-row" style="margin-bottom:4px">
        <button class="chip" :class="{ on: selOrg === '全部' }" @click="selOrg = '全部'">全部</button>
        <button v-for="o in orgNames" :key="o" class="chip" :class="{ on: selOrg === o }" @click="selOrg = o">{{ o }}</button>
      </div>
      <div v-for="o in orgs" :key="o.id" class="case-row" @click="toggle(o.id)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">
            <span class="tag" :class="o.tag === '考过' ? 'sw' : 'brand'" style="margin-right:6px">{{ o.tag }}</span>
            {{ o.point }}
          </div>
          <div class="case-meta">{{ o.org }}</div>
          <div v-if="expandedId === o.id" class="rec-body" style="margin-top:8px">{{ o.detail }}</div>
        </div>
      </div>
      <div v-if="orgs.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</div>
    </div>

    <!-- 媒体常识 -->
    <div v-if="showSection('knowledge', knowledge.length)" class="card">
      <div class="card-title">媒体常识 <span class="more">{{ knowledge.length }} 条</span></div>
      <div v-for="k in knowledge" :key="k.id" class="case-row" @click="toggle(k.id)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">{{ k.question }}</div>
          <div class="case-meta">
            <span v-if="k.domain">{{ k.domain }} · </span>{{ k.tag }}
          </div>
          <div v-if="expandedId === k.id" class="rec-body" style="margin-top:8px;background:#E4EFEA">{{ k.answer }}</div>
        </div>
      </div>
      <div v-if="knowledge.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</div>
    </div>

    <!-- 采访策划 -->
    <div v-if="showSection('plans-i', interviewPlans.length)" class="card">
      <div class="card-title">采访策划案例 <span class="more">{{ interviewPlans.length }} 条</span></div>
      <div v-for="p in interviewPlans" :key="p.id" class="case-row" @click="toggle(p.id)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">{{ p.title }}</div>
          <div class="case-meta">{{ p.type }} · {{ p.topic }}</div>
          <div v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <ul style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <li v-for="(pt, j) in p.points" :key="j">{{ pt }}</li>
            </ul>
            <div class="rec-body">{{ p.note }}</div>
          </div>
        </div>
      </div>
      <div v-if="interviewPlans.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</div>
    </div>

    <!-- 报道策划 -->
    <div v-if="showSection('plans-r', reportPlans.length)" class="card">
      <div class="card-title">报道策划案例 <span class="more">{{ reportPlans.length }} 条</span></div>
      <div v-for="p in reportPlans" :key="p.id" class="case-row" @click="toggle(p.id)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">{{ p.title }}</div>
          <div class="case-meta">{{ p.type }} · {{ p.topic }}</div>
          <div v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <ul style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <li v-for="(pt, j) in p.points" :key="j">{{ pt }}</li>
            </ul>
            <div class="rec-body">{{ p.note }}</div>
          </div>
        </div>
      </div>
      <div v-if="reportPlans.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</div>
    </div>

    <!-- 调研报告 -->
    <div v-if="showSection('reports', reports.length)" class="card">
      <div class="card-title">调研报告 <span class="more">{{ reports.length }} 条</span></div>
      <div v-for="r in reports" :key="r.id" class="case-row" @click="toggle(r.id)">
        <span class="case-dot"></span>
        <div style="flex:1">
          <div class="case-title">{{ r.title }}</div>
          <div class="case-meta">提纲 {{ r.outline.length }} 段 · 写法提示</div>
          <div v-if="expandedId === r.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <ol style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <li v-for="(seg, j) in r.outline" :key="j">{{ seg }}</li>
            </ol>
            <div class="rec-body">写法提示：{{ r.tips }}</div>
          </div>
        </div>
      </div>
      <div v-if="reports.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</div>
    </div>

    <div
      v-if="searching && orgs.length + knowledge.length + interviewPlans.length + reportPlans.length + reports.length === 0"
      style="font-size:12px;color:var(--text-3);text-align:center;padding:24px 0"
    >
      没有匹配「{{ kw.trim() }}」的内容
    </div>
  </div>
</template>
