<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useContentStore, type PinglunEntry, type PinglunDetail } from '@/stores/content'
import { getSetting } from '@/db/seed'
import { shizhengPriority } from '@shared/recommend'
import { filterPinglun, pickDailyKnowledge } from '@shared/library'

const content = useContentStore()
const examDate = ref('2026-11-27')

// 网页版 SPA 每次切 tab 重新挂载 → 小程序 onShow 每次进页都跑
onShow(async () => {
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
  uni.navigateTo({ url: '/pages/sub/shizheng' })
}

/** 平滑滚动到页内区块（网页 scrollIntoView → uni.pageScrollTo selector） */
function scrollTo(id: string) {
  uni.pageScrollTo({ selector: `#${id}`, duration: 300 })
}

/** 小程序不能开外链：复制链接到剪贴板，提示去浏览器打开 */
function copyLink(url: string) {
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' })
  })
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
  <view class="page">
    <view class="page-title">新闻实务</view>
    <view class="page-sub">统计驱动推荐 · 四大板块</view>

    <!-- 四板块入口（小程序不支持内联 SVG，图标改用文字符号） -->
    <view class="grid4">
      <view v-if="content.shizheng" class="grid-item" @click="toShizhengLibrary">
        <view class="gicon" style="background:#F9E7DD;color:var(--sw)"><text class="gicon-glyph">📄</text></view>
        <view class="gname">时政政策解读</view>
        <view class="gdesc">时政库 · 月度统计 + 解读</view>
      </view>
      <view v-if="content.daily?.guoji?.length" class="grid-item" @click="scrollTo('guoji')">
        <view class="gicon" style="background:#E7F0F0;color:var(--xc)"><text class="gicon-glyph">🌐</text></view>
        <view class="gname">国际新闻解读</view>
        <view class="gdesc">重点国外新闻 + 专业视角拆解</view>
      </view>
      <view class="grid-item" @click="scrollTo('pinglun')">
        <view class="gicon" style="background:#E4EFEA;color:var(--brand)"><text class="gicon-glyph">💬</text></view>
        <view class="gname">评论案例库</view>
        <view class="gdesc">按月归档 · 按领域检索</view>
      </view>
    </view>

    <!-- 每日消息 -->
    <view v-if="content.daily?.shiwu?.material" class="card rec-card" style="border-left-color:var(--sw)">
      <view class="rec-head"><text class="tag sw">每日消息</text></view>
      <view class="rec-title">{{ content.daily.shiwu.material.title }}</view>
      <view class="rec-body">{{ content.daily.shiwu.material.body }}</view>
      <view style="font-size:12px;color:var(--text-3);margin-top:6px">
        <text>来源：</text>
        <text
          v-if="content.daily.shiwu.material.url"
          style="color:var(--text-3)"
          @click="copyLink(content.daily.shiwu.material.url || '')"
        >{{ content.daily.shiwu.material.source }}</text>
        <text v-else>{{ content.daily.shiwu.material.source }}</text>
        <text
          v-if="content.daily.shiwu.material.url"
          style="color:var(--brand);margin-left:8px"
          @click="copyLink(content.daily.shiwu.material.url || '')"
        >查看原文 →</text>
      </view>
    </view>

    <!-- 每日纠错知识点 -->
    <view v-if="dailyKnowledge" class="card">
      <view class="card-title">每日纠错 <text class="more">第 {{ dailyKnowledge.index }}/{{ content.knowledge.length }} 条</text></view>
      <view class="rec-title" style="font-size:14px">{{ dailyKnowledge.item.point }}</view>
      <view class="rec-body" style="background:#F9E7DD;margin-top:6px">错误：{{ dailyKnowledge.item.wrong }}</view>
      <view class="rec-body" style="background:#E4EFEA;margin-top:6px">正确：{{ dailyKnowledge.item.right }}</view>
      <view style="font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.7">{{ dailyKnowledge.item.note }}</view>
    </view>

    <!-- 时政月统计 -->
    <view v-if="content.shizheng" id="shizheng" class="card" :class="{ 'rec-card': prioritizeShizheng }" :style="prioritizeShizheng ? 'border-left-color:var(--sw)' : ''">
      <view class="card-title">
        {{ content.shizheng.month }} 时政知识点
        <text v-if="prioritizeShizheng" class="tag sw" style="margin-left:auto">距考&lt;30天 · 置顶</text>
        <text v-else class="more">{{ content.shizheng.items.length }} 条</text>
      </view>
      <view v-for="(it, i) in content.shizheng.items.slice(0, 8)" :key="i" class="sz-row">
        <text class="sz-num">{{ String(i + 1).padStart(2, '0') }}</text>
        <text class="sz-name">{{ it.title }}<text v-if="it.source" style="font-size:11px;color:var(--text-3)"> · {{ it.source }}</text></text>
        <text v-if="it.points.length" class="sz-heat">{{ it.points.length }} 点</text>
      </view>
      <view v-if="content.shizheng.items.length === 0" style="font-size:12px;color:var(--text-3)">本月暂无时政统计</view>
      <view style="margin-top:10px;text-align:right">
        <text style="font-size:12px;color:var(--sw);font-weight:600" @click="toShizhengLibrary">进入时政库 →</text>
      </view>
    </view>

    <!-- 国际新闻解读 -->
    <view v-if="content.daily?.guoji?.length" id="guoji" class="card">
      <view class="card-title">国际新闻解读</view>
      <view v-for="(g, i) in content.daily.guoji" :key="i">
        <view class="rec-title" style="font-size:14px">{{ g.title }}</view>
        <view style="margin:4px 0 8px 18px;font-size:12px;color:var(--text-2);line-height:1.7">
          <view v-for="(p, j) in g.points.slice(0,3)" :key="j">· {{ p }}</view>
        </view>
        <view v-if="g.reading" class="rec-body" style="background:#E7F0F0;padding:8px 10px;border-radius:8px">{{ g.reading }}</view>
        <view style="font-size:12px;color:var(--text-3);margin:4px 0 10px">
          <text>来源：</text>
          <text v-if="g.url" style="color:var(--text-3)" @click="copyLink(g.url)">{{ g.source }}</text>
          <text v-else>{{ g.source }}</text>
        </view>
      </view>
    </view>

    <!-- 评论案例库 -->
    <view id="pinglun" class="card">
      <view class="card-title">评论案例库 <text class="more">共 {{ content.pinglunIndex.length }} 篇 / 筛选 {{ filteredPinglun.length }} 篇</text></view>
      <input v-model="pinglunKw" class="input" style="margin-bottom:10px" placeholder="搜索标题 / 结构 / 考用 / 来源…" />
      <view v-if="months.length" class="chip-row">
        <button class="chip" plain :class="{ on: !selMonth }" @click="selMonth = ''">全部</button>
        <button v-for="m in months" :key="m" class="chip" plain :class="{ on: selMonth === m }" @click="selMonth = m">{{ m.slice(5) }}月</button>
      </view>
      <view class="chip-row">
        <button v-for="f in fields" :key="f" class="chip" plain :class="{ on: selField === f }" @click="selField = f">{{ f }}</button>
      </view>
      <view v-for="p in filteredPinglun" :key="p.id" class="case-row" @click="togglePinglun(p)">
        <text class="case-dot"></text>
        <view style="flex:1">
          <view class="case-title">{{ p.title }}</view>
          <view class="case-meta">{{ p.month }}{{ p.source ? ' · ' + p.source : '' }} · {{ p.structure || '论点结构' }}</view>
          <view v-if="expandedId === p.id" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <view v-if="p.structure" class="rec-body">结构：{{ p.structure }}</view>
            <view v-if="fmtExamUse(p.examUse)" style="font-size:12px;color:#A34E24;margin-top:6px">考用：{{ fmtExamUse(p.examUse) }}</view>
            <view style="font-size:12px;color:var(--text-3);margin-top:6px">
              <text>来源：{{ p.source || '—' }}</text>
              <text
                v-if="pinglunDetails[p.id]?.url"
                style="color:var(--brand);margin-left:8px"
                @click.stop="copyLink(pinglunDetails[p.id]?.url || '')"
              >查看原文</text>
            </view>
          </view>
        </view>
      </view>
      <view v-if="filteredPinglun.length === 0" style="font-size:12px;color:var(--text-3)">
        {{ content.pinglunIndex.length ? '没有匹配的评论' : '评论库暂无内容' }}
      </view>
    </view>
  </view>
</template>

<style scoped>
.page { padding: 8px 16px 32px; }
.gicon-glyph { font-size: 18px; line-height: 1; }
/* 清掉 uni button 默认边框/内边距，视觉交给 components.css 的类 */
button::after { border: none; }
button { padding: 0; line-height: inherit; }
.chip { padding: 8px 16px; }
</style>
