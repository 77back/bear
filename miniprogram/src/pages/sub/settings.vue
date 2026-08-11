<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getSetting, setSetting } from '@/db/seed'
import { todayStr } from '@/db'

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

// 二级页每次 navigateTo 都是新实例，onLoad 等价于网页版的 onMounted
onLoad(async () => {
  nickname.value = await getSetting('nickname', '小熊')
  examDate.value = await getSetting('examDate', '2026-11-27')
  weeklyGoal.value = await getSetting('weeklyGoal', 300)
  dailyMinutes.value = await getSetting('dailyMinutes', 120)
  gradeApiBase.value = await getSetting('gradeApiBase', '')
  gradeApiKey.value = await getSetting('gradeApiKey', '')
  gradeApiModel.value = await getSetting('gradeApiModel', 'gpt-4o-mini')
})

// 网页版 input(type=date) → uni picker（date 模式）；start 对齐原 min 属性
function onExamDateChange(e: { detail: { value: string } }) {
  examDate.value = e.detail.value
}

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

function goToday() {
  uni.switchTab({ url: '/pages/today/index' })
}
</script>

<template>
  <view class="page">
    <view class="page-title">设置</view>
    <view class="page-sub">考试日与目标 · 驱动任务规划</view>

    <view class="card">
      <view class="field">
        <label>昵称</label>
        <input class="input" v-model="nickname" placeholder="你的称呼" />
      </view>
      <view class="field">
        <label>考试日期</label>
        <picker mode="date" :value="examDate" :start="todayStr()" @change="onExamDateChange">
          <view class="input picker-box">{{ examDate }}<text class="picker-arrow">▾</text></view>
        </picker>
      </view>
      <view class="field">
        <label>周目标题量</label>
        <input class="input" type="number" v-model.number="weeklyGoal" />
      </view>
      <view class="field">
        <label>每日可用学习分钟</label>
        <input class="input" type="number" v-model.number="dailyMinutes" />
      </view>
      <button class="btn btn-primary" @click="save">保存设置</button>
    </view>

    <view class="card">
      <view class="card-title">批改 API（可选）</view>
      <view class="page-sub" style="padding:0 0 8px">配置后实务练习可用大模型批改；留空则仅对照参考自评。密钥仅存本地。</view>
      <view class="field">
        <label>API Base URL（OpenAI 兼容）</label>
        <input class="input" v-model="gradeApiBase" placeholder="https://api.openai.com/v1" />
      </view>
      <view class="field">
        <label>API Key</label>
        <input class="input" password v-model="gradeApiKey" placeholder="sk-..." />
      </view>
      <view class="field">
        <label>模型</label>
        <input class="input" v-model="gradeApiModel" placeholder="gpt-4o-mini" />
      </view>
      <button class="btn btn-soft" @click="save">保存批改配置</button>
    </view>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="goToday">返回今日</button>

    <view class="toast" :class="{ show: toast }">{{ toast }}</view>
  </view>
</template>

<style scoped>
/* 页面容器：网页版由 .screen 提供内边距（底部 96px 为网页 tabbar 残留，删除） */
.page {
  padding: 0 16px 24px;
}
/* uni button 默认样式复位，观感交由 components.css 类名控制 */
button {
  margin: 0;
  padding: 0;
  line-height: normal;
  background: none;
}
button::after {
  border: none;
}
/* 小程序版 design-tokens 无 * 盒模型 reset，宽度 100% 的表单控件需补 */
.input {
  box-sizing: border-box;
}
/* 日期 picker 触发框，对齐网页版 input(type=date) 观感 */
.picker-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.picker-arrow {
  font-size: 10px;
  color: var(--text-3);
}
</style>
