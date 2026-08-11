<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useContentStore } from '@/stores/content'
import { filterShizheng } from '@shared/library'

// 时政库：管线月度累积（content/shizheng/），按月份分区 + 关键词检索
const content = useContentStore()
const keyword = ref('')

onShow(() => content.loadShizhengAll())

const total = computed(() => content.shizhengMonths.reduce((n, m) => n + m.items.length, 0))

const list = computed(() => filterShizheng(content.shizhengMonths, keyword.value))

const filteredTotal = computed(() => list.value.reduce((n, m) => n + m.items.length, 0))

/** 小程序不能开外链：复制链接到剪贴板，提示去浏览器打开 */
function copyLink(url: string) {
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' })
  })
}

function backToShiwu() {
  uni.switchTab({ url: '/pages/shiwu/index' })
}
</script>

<template>
  <view class="page">
    <view class="page-title">时政库</view>
    <view class="page-sub">
      每日时政自动累积 · 共 {{ total }} 条<text v-if="keyword.trim()"> / 筛选 {{ filteredTotal }} 条</text>
    </view>

    <block v-if="content.shizhengMonths.length">
      <input v-model="keyword" class="input" style="margin-bottom:10px" placeholder="搜索标题 / 领域 / 解读 / 来源…" />
    </block>

    <view v-if="!content.shizhengMonths.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      时政库积累中 · 每日时政会自动归档到这里
    </view>

    <view v-else-if="!list.length" class="card" style="text-align:center;color:var(--text-3);padding:32px 16px">
      没有匹配的时政
    </view>

    <view v-for="m in list" :key="m.month" class="card">
      <view class="card-title">{{ m.month.slice(0, 4) }}年{{ Number(m.month.slice(5)) }}月 <text class="more">{{ m.items.length }} 条</text></view>
      <view v-for="(it, i) in m.items" :key="i" style="padding:10px 0;border-top:1px solid var(--line)">
        <view style="display:flex;align-items:flex-start;gap:8px">
          <view style="flex:1;min-width:0">
            <view class="rec-title" style="font-size:14px">{{ it.title }}</view>
            <view style="font-size:12px;color:var(--text-3);margin-top:4px">
              <text>{{ it.date || m.month }}</text>
              <block v-if="it.source">
                <text> · </text>
                <text v-if="it.url" style="color:inherit" @click="copyLink(it.url)">{{ it.source }}</text>
                <text v-else>{{ it.source }}</text>
              </block>
            </view>
          </view>
          <text v-for="d in (it.domains || []).slice(0, 2)" :key="d" class="tag sw">{{ d }}</text>
        </view>
        <view v-if="it.analysis || it.reading" class="rec-body" style="margin-top:6px">解读：{{ it.analysis || it.reading }}</view>
      </view>
    </view>

    <button class="btn btn-soft" plain style="margin-bottom:12px" @click="backToShiwu">返回实务</button>
  </view>
</template>

<style scoped>
.page { padding: 8px 16px 32px; }
/* 清掉 uni button 默认边框/内边距，视觉交给 components.css 的类 */
button::after { border: none; }
button { padding: 0; line-height: inherit; }
</style>
