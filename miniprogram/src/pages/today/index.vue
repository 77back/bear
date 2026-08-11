<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTaskStore } from '@/stores/task'
import { useContentStore } from '@/stores/content'
import { getSetting } from '@/db/seed'
import { parseDate, type Subject, type Task } from '@/db'

const store = useTaskStore()
const content = useContentStore()

const nickname = ref('小熊')
const examDate = ref('2026-11-27')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

// 网页版内联 SVG 在小程序不可渲染，改为 base64 image（颜色由 currentColor 固化为对应色值）
const flameIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMmMxIDQtNCA1LjUtNCAxMGE0IDQgMCAwMDggMGMwLTItMS0zLTEtM3MzIDEuNSAzIDVhNiA2IDAgMTEtMTIgMEM2IDggMTEgNiAxMiAyeiIvPjwvc3ZnPg=='
const checkIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNCAxMi41bDUgNUwyMCA2LjUiLz48L3N2Zz4='
const checkinWhiteIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjIuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgNkw5IDE3bC01LTUiLz48L3N2Zz4='
const checkinBrandIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjM2U3YTVlIiBzdHJva2Utd2lkdGg9IjIuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgNkw5IDE3bC01LTUiLz48L3N2Zz4='

const weekdayCN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const dateLabel = computed(() => {
  const now = new Date()
  const md = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdayCN[now.getDay()]}`
  return md
})

const daysToExam = computed(() => {
  const diff = parseDate(examDate.value).getTime() - new Date(new Date().toDateString()).getTime()
  return Math.max(0, Math.round(diff / 86400000))
})

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

// 网页版 SPA 每次切回今日页都会重新挂载（onMounted 必跑）→ 小程序对应 onShow
onShow(async () => {
  nickname.value = await getSetting('nickname', '小熊')
  examDate.value = await getSetting('examDate', '2026-11-27')
  await store.load()
  // 内容管线当日包（platform/request 自带缓存回退）
  content.load()
})

// 调整任务（增删）
const adjusting = ref(false)
const newSubject = ref<Subject>('xc')
const newTitle = ref('')
const subjectTagClass: Record<Subject, string> = { xc: 'xc', sl: 'sl', sw: 'sw' }
const subjectLabel: Record<Subject, string> = { xc: '行测', sl: '申论', sw: '实务' }

// 网页版 select 下拉 → uni picker（selector 模式）
const subjectOrder: Subject[] = ['xc', 'sl', 'sw']
const subjectOptions = subjectOrder.map((s) => subjectLabel[s])
const newSubjectIndex = computed(() => subjectOrder.indexOf(newSubject.value))

function onSubjectChange(e: { detail: { value: number | string } }) {
  newSubject.value = subjectOrder[Number(e.detail.value)] ?? 'xc'
}

async function addOne() {
  const title = newTitle.value.trim()
  if (!title) return
  await store.addTask(newSubject.value, title)
  newTitle.value = ''
}

// 编辑已有任务（行内编辑标题/备注）
const editingId = ref<number | null>(null)
const editTitle = ref('')
const editMeta = ref('')

function startEdit(t: Task) {
  editingId.value = t.id!
  editTitle.value = t.title
  editMeta.value = t.meta ?? ''
}

async function saveEdit() {
  const title = editTitle.value.trim()
  if (editingId.value == null || !title) return
  await store.updateTask(editingId.value, { title, meta: editMeta.value.trim() || undefined })
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

async function doCheckin() {
  const r = await store.checkin()
  showToast(r.msg)
}

function onReport(type: 'week' | 'month') {
  showToast(
    type === 'week' ? `本周小结：任务完成率 ${Math.round(store.progressPct)}%` : '月度小结：随统计完善（阶段2）'
  )
}

function goSettings() {
  uni.navigateTo({ url: '/pages/sub/settings' })
}
</script>

<template>
  <view class="page">
    <!-- Hero -->
    <view class="hero">
      <view class="hello">早安，{{ nickname }}</view>
      <view class="date">{{ dateLabel }} · 距考试还有 {{ daysToExam }} 天</view>
      <view class="streak">
        <image class="streak-icon" :src="flameIcon" mode="aspectFit" />
        连续打卡 {{ store.currentStreak }} 天
      </view>
    </view>

    <!-- 今日任务 -->
    <view class="card">
      <view class="card-title">
        今日任务
        <text style="font-size:12px;color:var(--text-3);font-weight:400">{{ store.progressText }}</text>
        <button class="more" @click="adjusting = !adjusting; cancelEdit()">{{ adjusting ? '完成' : '调整' }}</button>
      </view>
      <view class="bar" style="margin-bottom:8px">
        <view class="bar-fill" :style="{ width: store.progressPct + '%', background: 'var(--brand)' }"></view>
      </view>

      <view v-if="!adjusting">
        <view
          v-for="t in store.tasks"
          :key="t.id"
          class="task-row"
          :class="{ done: t.status === 'done' }"
          @click="store.toggle(t.id!)"
        >
          <view class="checkbox">
            <image class="check-icon" :src="checkIcon" mode="aspectFit" />
          </view>
          <view class="task-info">
            <view class="task-name">{{ t.title }}</view>
            <view class="task-meta" v-if="t.meta">{{ t.meta }}</view>
          </view>
          <text class="tag" :class="subjectTagClass[t.subject]">{{ subjectLabel[t.subject] }}</text>
        </view>
      </view>

      <!-- 调整模式：增删改 -->
      <view v-else>
        <view v-for="t in store.tasks" :key="t.id" class="task-row">
          <template v-if="editingId === t.id">
            <view class="task-info" style="display:flex;flex-direction:column;gap:6px">
              <input class="input" v-model="editTitle" placeholder="任务标题" @confirm="saveEdit" />
              <input class="input" v-model="editMeta" placeholder="备注（可选）" @confirm="saveEdit" />
            </view>
            <button class="more" @click="saveEdit">保存</button>
            <button class="more" @click="cancelEdit">取消</button>
          </template>
          <template v-else>
            <view class="task-info">
              <view class="task-name">{{ t.title }}</view>
              <view class="task-meta" v-if="t.meta">{{ t.meta }}</view>
            </view>
            <text class="tag" :class="subjectTagClass[t.subject]">{{ subjectLabel[t.subject] }}</text>
            <button class="more" @click="startEdit(t)">编辑</button>
            <button class="more" style="color:#C0453E" @click="store.removeTask(t.id!)">删除</button>
          </template>
        </view>
        <view style="display:flex;gap:8px;margin-top:8px">
          <picker
            mode="selector"
            :range="subjectOptions"
            :value="newSubjectIndex"
            @change="onSubjectChange"
            style="width:90px;flex-shrink:0"
          >
            <view class="select picker-box">{{ subjectLabel[newSubject] }}<text class="picker-arrow">▾</text></view>
          </picker>
          <input class="input" style="flex:1" v-model="newTitle" placeholder="新增任务…" @confirm="addOne" />
          <button class="btn btn-soft" style="width:auto;padding:0 16px;flex-shrink:0" @click="addOne">添加</button>
        </view>
      </view>
    </view>

    <!-- 打卡 -->
    <button
      class="btn"
      :class="store.todayCheckedIn ? 'btn-soft' : 'btn-primary'"
      style="margin-bottom:14px"
      :disabled="store.todayCheckedIn"
      @click="doCheckin"
    >
      <image class="btn-icon" :src="store.todayCheckedIn ? checkinBrandIcon : checkinWhiteIcon" mode="aspectFit" />
      {{ store.todayCheckedIn ? `今日已打卡 · 连续 ${store.currentStreak} 天` : '完成全部任务，点击打卡' }}
    </button>

    <!-- 打卡日历 -->
    <view class="card">
      <view class="card-title">
        {{ store.calMonth.m }}月打卡日历
        <text class="more">连续 {{ store.currentStreak }} 天</text>
      </view>
      <view class="cal-grid">
        <text v-for="(h, i) in store.weekHead()" :key="'h' + i" class="cal-cell head">{{ h }}</text>
        <text
          v-for="(c, i) in store.monthCells"
          :key="i"
          class="cal-cell"
          :class="c.empty ? 'empty' : 'l' + c.level"
        >{{ c.empty ? '' : c.day }}</text>
      </view>
      <view style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-soft" style="flex:1;min-height:44px;font-size:14px" @click="onReport('week')">本周小结</button>
        <button class="btn btn-soft" style="flex:1;min-height:44px;font-size:14px" @click="onReport('month')">月度总结</button>
      </view>
    </view>

    <!-- 今日推荐流（内容管线当日包，阶段3） -->
    <template v-if="content.daily">
      <view
        v-if="content.daily.cases.length"
        class="card rec-card"
        style="border-left-color:var(--sl)"
      >
        <view class="rec-head">
          <text class="tag sl">申论 · 每日案例</text>
          <text style="font-size:11px;color:var(--text-3)">
            适用：{{ content.daily.cases[0].themes.length ? content.daily.cases[0].themes.join(' / ') : '积累' }}
          </text>
        </view>
        <view class="rec-title">{{ content.daily.cases[0].title }}</view>
        <view class="rec-body">{{ content.daily.cases[0].summary }}</view>
      </view>

      <view
        v-if="content.daily.shiwu && content.daily.shiwu.material"
        class="card rec-card"
        style="border-left-color:var(--sw)"
      >
        <view class="rec-head">
          <text class="tag sw">实务 · 每日素材</text>
          <text style="font-size:11px;color:var(--text-3)">可练：消息 / 标题 / 纠错</text>
        </view>
        <view class="rec-title">{{ content.daily.shiwu.material.title }}</view>
        <view class="rec-body">{{ content.daily.shiwu.material.body }}</view>
      </view>
    </template>
    <view v-else-if="content.loading" class="card" style="text-align:center;color:var(--text-3);font-size:13px">
      正在加载今日内容…
    </view>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="goSettings">设置 · 考试日与目标</button>

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
.input,
.select {
  box-sizing: border-box;
}
/* 调整模式行内按钮：网页版未命中任何样式（浏览器默认按钮），此处对齐 .card-title .more 的文字按钮观感 */
.task-row .more {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
  padding: 8px 0 8px 12px;
}
/* 进度条填充：网页版用 <i> 标签（.bar > i），小程序改为 view */
.bar > .bar-fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;
}
/* 勾选图标：网页版内联 svg（.checkbox svg），小程序改为 base64 image */
.check-icon {
  width: 14px;
  height: 14px;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.18s ease;
}
.task-row.done .checkbox .check-icon {
  opacity: 1;
  transform: scale(1);
}
.streak-icon {
  width: 14px;
  height: 14px;
}
.btn-icon {
  width: 18px;
  height: 18px;
}
/* 科目 picker 触发框，对齐网页版 select 观感 */
.picker-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.picker-arrow {
  font-size: 10px;
  color: var(--text-3);
  margin-left: 4px;
}
</style>
