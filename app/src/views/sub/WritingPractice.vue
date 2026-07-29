<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { usePracticeStore } from '@/stores/practice'
import type { PracticeQtype } from '@/db'

const route = useRoute()
const router = useRouter()
const content = useContentStore()
const practice = usePracticeStore()

const qtype = computed(() => (route.query.qtype as PracticeQtype) || '消息')
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

onMounted(async () => {
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
</script>

<template>
  <div>
    <div class="page-title">{{ qtype }}写作练习</div>
    <div class="page-sub">实务每日练习 · 完成后记录入库</div>

    <!-- 素材 -->
    <div v-if="material" class="card">
      <div class="card-title">今日素材 <span class="more">{{ material.source }}</span></div>
      <div class="rec-title" style="font-size:14px;margin-bottom:6px">{{ material.title }}</div>
      <div class="rec-body">{{ material.body }}</div>
    </div>

    <!-- 题目要求 -->
    <div v-if="exercise" class="card">
      <div class="card-title">题目要求</div>
      <div class="rec-body">{{ exercise.prompt }}</div>
    </div>

    <!-- 作答 -->
    <div class="card">
      <div class="card-title">我的习作</div>
      <textarea
        class="textarea"
        v-model="answer"
        :placeholder="qtype === '消息' ? '在此写约 300 字消息…' : '在此作答…'"
      ></textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-soft" style="flex:1" @click="showRef = !showRef">{{ showRef ? '隐藏' : '对照' }}参考</button>
        <button class="btn btn-soft" style="flex:1" :disabled="grading" @click="doGrade">{{ grading ? '批改中…' : '大模型批改' }}</button>
      </div>
      <button class="btn btn-primary" style="margin-top:8px" @click="save">保存练习记录</button>
    </div>

    <!-- 参考 -->
    <div v-if="showRef && exercise" class="card">
      <div class="card-title">参考</div>
      <div class="rec-body" style="white-space:pre-wrap">{{ exercise.reference || '（管线未生成参考；降级模式下仅提供素材原文）' }}</div>
    </div>

    <!-- 批改反馈 -->
    <div v-if="feedback" class="card">
      <div class="card-title">批改反馈</div>
      <div class="rec-body" style="white-space:pre-wrap">{{ feedback }}</div>
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/sw')">返回实务</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
