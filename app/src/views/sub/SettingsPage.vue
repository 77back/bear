<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSetting, setSetting } from '@/db/seed'
import { todayStr } from '@/db'

const router = useRouter()
const nickname = ref('小熊')
const examDate = ref('2026-11-27')
const weeklyGoal = ref(300)
const dailyMinutes = ref(120)
const gradeApiBase = ref('')
const gradeApiKey = ref('')
const gradeApiModel = ref('gpt-4o-mini')
const toast = ref('')

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2000)
}

onMounted(async () => {
  nickname.value = await getSetting('nickname', '小熊')
  examDate.value = await getSetting('examDate', '2026-11-27')
  weeklyGoal.value = await getSetting('weeklyGoal', 300)
  dailyMinutes.value = await getSetting('dailyMinutes', 120)
  gradeApiBase.value = await getSetting('gradeApiBase', '')
  gradeApiKey.value = await getSetting('gradeApiKey', '')
  gradeApiModel.value = await getSetting('gradeApiModel', 'gpt-4o-mini')
})

async function save() {
  await setSetting('nickname', nickname.value)
  await setSetting('examDate', examDate.value)
  await setSetting('weeklyGoal', Number(weeklyGoal.value))
  await setSetting('dailyMinutes', Number(dailyMinutes.value))
  await setSetting('gradeApiBase', gradeApiBase.value.trim())
  await setSetting('gradeApiKey', gradeApiKey.value.trim())
  await setSetting('gradeApiModel', gradeApiModel.value.trim())
  showToast('设置已保存')
}
</script>

<template>
  <div>
    <div class="page-title">设置</div>
    <div class="page-sub">考试日与目标 · 驱动任务规划</div>

    <div class="card">
      <div class="field">
        <label>昵称</label>
        <input class="input" v-model="nickname" placeholder="你的称呼" />
      </div>
      <div class="field">
        <label>考试日期</label>
        <input class="input" type="date" v-model="examDate" :min="todayStr()" />
      </div>
      <div class="field">
        <label>周目标题量</label>
        <input class="input" type="number" min="0" step="10" v-model.number="weeklyGoal" />
      </div>
      <div class="field">
        <label>每日可用学习分钟</label>
        <input class="input" type="number" min="0" step="10" v-model.number="dailyMinutes" />
      </div>
      <button class="btn btn-primary" @click="save">保存设置</button>
    </div>

    <div class="card">
      <div class="card-title">批改 API（可选）</div>
      <div class="page-sub" style="padding:0 0 8px">配置后实务练习可用大模型批改；留空则仅对照参考自评。自用 PWA，密钥仅存本地。</div>
      <div class="field">
        <label>API Base URL（OpenAI 兼容）</label>
        <input class="input" v-model="gradeApiBase" placeholder="https://api.openai.com/v1" />
      </div>
      <div class="field">
        <label>API Key</label>
        <input class="input" type="password" v-model="gradeApiKey" placeholder="sk-..." autocomplete="off" />
      </div>
      <div class="field">
        <label>模型</label>
        <input class="input" v-model="gradeApiModel" placeholder="gpt-4o-mini" />
      </div>
      <button class="btn btn-soft" @click="save">保存批改配置</button>
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/today')">返回今日</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
