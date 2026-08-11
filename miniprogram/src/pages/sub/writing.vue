<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useContentStore } from '@/stores/content'
import { usePracticeStore } from '@/stores/practice'
import type { PracticeQtype } from '@/db'

const content = useContentStore()
const practice = usePracticeStore()

// 网页版从 route.query.qtype 取题型 → 小程序 onLoad options
const qtype = ref<PracticeQtype>('消息')
onLoad((options) => {
  const q = options?.qtype as PracticeQtype | undefined
  if (q) qtype.value = q
})

const answer = ref('')
const showRef = ref(false)
const grading = ref(false)
const feedback = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

onShow(async () => {
  await content.load()
})

const material = computed(() => content.daily?.shiwu?.material)
const exercise = computed(() => content.daily?.shiwu?.exercises.find((e) => e.qtype === qtype.value))

async function save() {
  if (!answer.value.trim()) {
    showToast('请先写一段习作再保存')
    return
  }
  await practice.record({
    qtype: qtype.value,
    materialRef: material.value?.title,
    content: answer.value.trim()
  })
  showToast('已记录本次练习 ✓')
}

async function doGrade() {
  if (!answer.value.trim()) {
    showToast('请先写一段习作再批改')
    return
  }
  grading.value = true
  feedback.value = ''
  try {
    const fb = await practice.grade(
      qtype.value,
      exercise.value?.prompt || `${qtype.value}写作`,
      answer.value.trim(),
      exercise.value?.reference || ''
    )
    feedback.value = fb ?? '未配置批改 API（gradeApiBase/gradeApiKey），请对照参考自评。'
  } catch (e) {
    feedback.value = '批改失败：' + (e as Error).message
  } finally {
    grading.value = false
  }
}

function backToShiwu() {
  uni.switchTab({ url: '/pages/shiwu/index' })
}
</script>

<template>
  <view class="page">
    <view class="page-title">{{ qtype }}写作练习</view>
    <view class="page-sub">实务每日练习 · 完成后记录入库</view>

    <!-- 素材 -->
    <view v-if="material" class="card">
      <view class="card-title">今日素材 <text class="more">{{ material.source }}</text></view>
      <view class="rec-title" style="font-size:14px;margin-bottom:6px">{{ material.title }}</view>
      <view class="rec-body">{{ material.body }}</view>
    </view>

    <!-- 题目要求 -->
    <view v-if="exercise" class="card">
      <view class="card-title">题目要求</view>
      <view class="rec-body">{{ exercise.prompt }}</view>
    </view>

    <!-- 作答 -->
    <view class="card">
      <view class="card-title">我的习作</view>
      <textarea
        class="textarea"
        v-model="answer"
        :placeholder="qtype === '消息' ? '在此写约 300 字消息…' : '在此作答…'"
      ></textarea>
      <view style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-soft" plain style="flex:1" @click="showRef = !showRef">{{ showRef ? '隐藏' : '对照' }}参考</button>
        <button class="btn btn-soft" plain style="flex:1" :disabled="grading" @click="doGrade">{{ grading ? '批改中…' : '大模型批改' }}</button>
      </view>
      <button class="btn btn-primary" plain style="margin-top:8px" @click="save">保存练习记录</button>
    </view>

    <!-- 参考 -->
    <view v-if="showRef && exercise" class="card">
      <view class="card-title">参考</view>
      <view class="rec-body" style="white-space:pre-wrap">{{ exercise.reference || '（管线未生成参考；降级模式下仅提供素材原文）' }}</view>
    </view>

    <!-- 批改反馈 -->
    <view v-if="feedback" class="card">
      <view class="card-title">批改反馈</view>
      <view class="rec-body" style="white-space:pre-wrap">{{ feedback }}</view>
    </view>

    <button class="btn btn-soft" plain style="margin-bottom:12px" @click="backToShiwu">返回实务</button>

    <view class="toast" :class="{ show: toast }">{{ toast }}</view>
  </view>
</template>

<style scoped>
.page { padding: 8px 16px 32px; }
/* 清掉 uni button 默认边框/内边距，视觉交给 components.css 的类 */
button::after { border: none; }
button { padding: 0; line-height: inherit; }
.textarea { box-sizing: border-box; }
</style>
