<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useContentStore } from '@/stores/content'
import {
  filterMediaOrgs,
  filterMediaKnowledge,
  filterMediaPlans,
  filterMediaReports
} from '@shared/library'

const content = useContentStore()

onShow(async () => {
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
  <view class="page">
    <view class="page-title">媒体备考</view>
    <view class="page-sub">信息搜集展示 · 不出题</view>

    <input v-model="kw" class="input" style="margin-bottom:10px" placeholder="跨分区搜索：机构 / 话题 / 关键词…" />

    <view v-if="!searching" class="chip-row" style="margin-bottom:12px">
      <button
        v-for="s in sections"
        :key="s.key"
        class="chip"
        plain
        :class="{ on: active === s.key }"
        @click="active = s.key"
      >
        {{ s.label }}
      </button>
    </view>

    <!-- 机构常识 -->
    <view v-if="showSection('orgs', orgs.length)" class="card">
      <view class="card-title">机构常识 <text class="more">{{ orgs.length }} 条</text></view>
      <view v-if="orgNames.length" class="chip-row" style="margin-bottom:4px">
        <button class="chip" plain :class="{ on: selOrg === '全部' }" @click="selOrg = '全部'">全部</button>
        <button v-for="o in orgNames" :key="o" class="chip" plain :class="{ on: selOrg === o }" @click="selOrg = o">{{ o }}</button>
      </view>
      <view v-for="o in orgs" :key="o.id" class="case-row" @click="toggle(o.id)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">
            <text class="tag" :class="o.tag === '考过' ? 'sw' : 'brand'" style="margin-right:6px">{{ o.tag }}</text>
            {{ o.point }}
          </view>
          <view class="case-meta">{{ o.org }}</view>
          <view v-if="expandedId === o.id" class="rec-body" style="margin-top:8px">{{ o.detail }}</view>
        </view>
      </view>
      <view v-if="orgs.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</view>
    </view>

    <!-- 媒体常识 -->
    <view v-if="showSection('knowledge', knowledge.length)" class="card">
      <view class="card-title">媒体常识 <text class="more">{{ knowledge.length }} 条</text></view>
      <view v-for="k in knowledge" :key="k.id" class="case-row" @click="toggle(k.id)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">{{ k.question }}</view>
          <view class="case-meta">
            <text v-if="k.domain">{{ k.domain }} · </text>{{ k.tag }}
          </view>
          <view v-if="expandedId === k.id" class="rec-body" style="margin-top:8px;background:#E4EFEA">{{ k.answer }}</view>
        </view>
      </view>
      <view v-if="knowledge.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</view>
    </view>

    <!-- 采访策划 -->
    <view v-if="showSection('plans-i', interviewPlans.length)" class="card">
      <view class="card-title">采访策划案例 <text class="more">{{ interviewPlans.length }} 条</text></view>
      <view v-for="p in interviewPlans" :key="p.id" class="case-row" @click="toggle(p.id)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">{{ p.title }}</view>
          <view class="case-meta">{{ p.type }} · {{ p.topic }}</view>
          <view v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <view style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <view v-for="(pt, j) in p.points" :key="j">· {{ pt }}</view>
            </view>
            <view class="rec-body">{{ p.note }}</view>
          </view>
        </view>
      </view>
      <view v-if="interviewPlans.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</view>
    </view>

    <!-- 报道策划 -->
    <view v-if="showSection('plans-r', reportPlans.length)" class="card">
      <view class="card-title">报道策划案例 <text class="more">{{ reportPlans.length }} 条</text></view>
      <view v-for="p in reportPlans" :key="p.id" class="case-row" @click="toggle(p.id)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">{{ p.title }}</view>
          <view class="case-meta">{{ p.type }} · {{ p.topic }}</view>
          <view v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <view style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <view v-for="(pt, j) in p.points" :key="j">· {{ pt }}</view>
            </view>
            <view class="rec-body">{{ p.note }}</view>
          </view>
        </view>
      </view>
      <view v-if="reportPlans.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</view>
    </view>

    <!-- 调研报告 -->
    <view v-if="showSection('reports', reports.length)" class="card">
      <view class="card-title">调研报告 <text class="more">{{ reports.length }} 条</text></view>
      <view v-for="r in reports" :key="r.id" class="case-row" @click="toggle(r.id)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">{{ r.title }}</view>
          <view class="case-meta">提纲 {{ r.outline.length }} 段 · 写法提示</view>
          <view v-if="expandedId === r.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <view style="margin:0 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
              <view v-for="(seg, j) in r.outline" :key="j">{{ j + 1 }}. {{ seg }}</view>
            </view>
            <view class="rec-body">写法提示：{{ r.tips }}</view>
          </view>
        </view>
      </view>
      <view v-if="reports.length === 0" style="font-size:12px;color:var(--text-3)">暂无匹配内容</view>
    </view>

    <view
      v-if="searching && orgs.length + knowledge.length + interviewPlans.length + reportPlans.length + reports.length === 0"
      style="font-size:12px;color:var(--text-3);text-align:center;padding:24px 0"
    >
      没有匹配「{{ kw.trim() }}」的内容
    </view>
  </view>
</template>

<style scoped>
.page { padding: 8px 16px 32px; }
/* 清掉 uni button 默认边框/内边距，视觉交给 components.css 的类 */
button::after { border: none; }
button { padding: 0; line-height: inherit; }
.chip { padding: 8px 16px; }
</style>
