<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStatsStore } from '@/stores/stats'
import { QUIZ_MODULES } from '@/core/stats'
import type { QuizModule } from '@/db'

const router = useRouter()
const store = useStatsStore()

const module = ref<QuizModule>('言语')
const total = ref<number | null>(20)
const correct = ref<number | null>(null)
const seconds = ref<number | null>(null)
const weakInput = ref('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const ratePreview = computed(() => {
  if (!total.value || correct.value == null) return ''
  return Math.round((correct.value / total.value) * 100) + '%'
})
const valid = computed(
  () => !!total.value && correct.value != null && correct.value >= 0 && correct.value <= total.value
)

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

async function submit() {
  if (!valid.value || total.value == null || correct.value == null) {
    showToast('请填写正确的题数（0 ≤ 正确 ≤ 总数）')
    return
  }
  const weakPoints = weakInput.value
    .split(/[，,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  await store.record({
    module: module.value,
    total: total.value,
    correct: correct.value,
    seconds: seconds.value ?? undefined,
    weakPoints: weakPoints.length ? weakPoints : undefined
  })
  showToast(`已录入：${module.value} ${correct.value}/${total.value}（${ratePreview.value}）`)
  setTimeout(() => router.push('/xc'), 900)
}
</script>

<template>
  <div>
    <div class="page-title">录入刷题</div>
    <div class="page-sub">手动录一组正确数 · 题目库暂不做</div>

    <div class="card">
      <div class="field">
        <label>板块</label>
        <select class="select" v-model="module">
          <option v-for="m in QUIZ_MODULES" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div class="field">
        <label>总题数</label>
        <input class="input" type="number" min="1" v-model.number="total" placeholder="如 20" />
      </div>
      <div class="field">
        <label>正确数 <span v-if="ratePreview" style="color:var(--brand)">· 正确率 {{ ratePreview }}</span></label>
        <input class="input" type="number" min="0" v-model.number="correct" placeholder="如 16" />
      </div>
      <div class="field">
        <label>用时（秒，可选）</label>
        <input class="input" type="number" min="0" v-model.number="seconds" placeholder="如 600" />
      </div>
      <div class="field">
        <label>薄弱知识点（可选，逗号分隔）</label>
        <input class="input" v-model="weakInput" placeholder="如 排列组合, 概率" />
      </div>
      <button class="btn btn-primary" :disabled="!valid" @click="submit">保存记录</button>
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/xc')">返回行测</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
