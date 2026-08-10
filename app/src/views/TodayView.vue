<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useContentStore } from '@/stores/content'
import { getSetting } from '@/db/seed'
import { parseDate, type Subject, type Task } from '@/db'

const router = useRouter()
const store = useTaskStore()
const content = useContentStore()

const nickname = ref('小熊')
const examDate = ref('2026-11-27')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

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

onMounted(async () => {
  nickname.value = await getSetting('nickname', '小熊')
  examDate.value = await getSetting('examDate', '2026-11-27')
  await store.load()
  // 内容管线当日包（断网走 SW 缓存回退）
  content.load()
})

// 调整任务（增删）
const adjusting = ref(false)
const newSubject = ref<Subject>('xc')
const newTitle = ref('')
const subjectTagClass: Record<Subject, string> = { xc: 'xc', sl: 'sl', sw: 'sw' }
const subjectLabel: Record<Subject, string> = { xc: '行测', sl: '申论', sw: '实务' }

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
  showToast(type === 'week' ? `本周小结：任务完成率 ${Math.round(store.progressPct)}%` : '月度小结：随统计完善（阶段2）')
}
</script>

<template>
  <div>
    <!-- Hero -->
    <div class="hero">
      <div class="hello">早安，{{ nickname }}</div>
      <div class="date">{{ dateLabel }} · 距考试还有 {{ daysToExam }} 天</div>
      <div class="streak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 4-4 5.5-4 10a4 4 0 008 0c0-2-1-3-1-3s3 1.5 3 5a6 6 0 11-12 0C6 8 11 6 12 2z"/></svg>
        连续打卡 {{ store.currentStreak }} 天
      </div>
    </div>

    <!-- 今日任务 -->
    <div class="card">
      <div class="card-title">
        今日任务
        <span style="font-size:12px;color:var(--text-3);font-weight:400">{{ store.progressText }}</span>
        <button class="more" @click="adjusting = !adjusting; cancelEdit()">{{ adjusting ? '完成' : '调整' }}</button>
      </div>
      <div class="bar" style="margin-bottom:8px">
        <i :style="{ width: store.progressPct + '%', background: 'var(--brand)' }"></i>
      </div>

      <div v-if="!adjusting">
        <div
          v-for="t in store.tasks"
          :key="t.id"
          class="task-row"
          :class="{ done: t.status === 'done' }"
          @click="store.toggle(t.id!)"
        >
          <div class="checkbox">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>
          </div>
          <div class="task-info">
            <div class="task-name">{{ t.title }}</div>
            <div class="task-meta" v-if="t.meta">{{ t.meta }}</div>
          </div>
          <span class="tag" :class="subjectTagClass[t.subject]">{{ subjectLabel[t.subject] }}</span>
        </div>
      </div>

      <!-- 调整模式：增删改 -->
      <div v-else>
        <div
          v-for="t in store.tasks"
          :key="t.id"
          class="task-row"
          style="cursor:default"
        >
          <template v-if="editingId === t.id">
            <div class="task-info" style="display:flex;flex-direction:column;gap:6px">
              <input class="input" v-model="editTitle" placeholder="任务标题" @keyup.enter="saveEdit" @keyup.esc="cancelEdit" />
              <input class="input" v-model="editMeta" placeholder="备注（可选）" @keyup.enter="saveEdit" @keyup.esc="cancelEdit" />
            </div>
            <button class="more" @click="saveEdit">保存</button>
            <button class="more" @click="cancelEdit">取消</button>
          </template>
          <template v-else>
            <div class="task-info">
              <div class="task-name">{{ t.title }}</div>
              <div class="task-meta" v-if="t.meta">{{ t.meta }}</div>
            </div>
            <span class="tag" :class="subjectTagClass[t.subject]">{{ subjectLabel[t.subject] }}</span>
            <button class="more" @click="startEdit(t)">编辑</button>
            <button class="more" style="color:#C0453E" @click="store.removeTask(t.id!)">删除</button>
          </template>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <select class="select" style="width:90px" v-model="newSubject">
            <option value="xc">行测</option>
            <option value="sl">申论</option>
            <option value="sw">实务</option>
          </select>
          <input class="input" style="flex:1" v-model="newTitle" placeholder="新增任务…" @keyup.enter="addOne" />
          <button class="btn btn-soft" style="width:auto;padding:0 16px" @click="addOne">添加</button>
        </div>
      </div>
    </div>

    <!-- 打卡 -->
    <button
      class="btn"
      :class="store.todayCheckedIn ? 'btn-soft' : 'btn-primary'"
      style="margin-bottom:14px"
      :disabled="store.todayCheckedIn"
      @click="doCheckin"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      {{ store.todayCheckedIn ? `今日已打卡 · 连续 ${store.currentStreak} 天` : '完成全部任务，点击打卡' }}
    </button>

    <!-- 打卡日历 -->
    <div class="card">
      <div class="card-title">
        {{ store.calMonth.m }}月打卡日历
        <span class="more">连续 {{ store.currentStreak }} 天</span>
      </div>
      <div class="cal-grid">
        <span v-for="(h, i) in store.weekHead()" :key="'h' + i" class="cal-cell head">{{ h }}</span>
        <span
          v-for="(c, i) in store.monthCells"
          :key="i"
          class="cal-cell"
          :class="c.empty ? 'empty' : 'l' + c.level"
        >{{ c.empty ? '' : c.day }}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-soft" style="flex:1;min-height:44px;font-size:14px" @click="onReport('week')">本周小结</button>
        <button class="btn btn-soft" style="flex:1;min-height:44px;font-size:14px" @click="onReport('month')">月度总结</button>
      </div>
    </div>

    <!-- 今日推荐流（内容管线当日包，阶段3） -->
    <template v-if="content.daily">
      <div
        v-if="content.daily.cases.length"
        class="card rec-card"
        style="border-left-color:var(--sl)"
      >
        <div class="rec-head">
          <span class="tag sl">申论 · 每日案例</span>
          <span style="font-size:11px;color:var(--text-3)">
            适用：{{ content.daily.cases[0].themes.length ? content.daily.cases[0].themes.join(' / ') : '积累' }}
          </span>
        </div>
        <div class="rec-title">{{ content.daily.cases[0].title }}</div>
        <div class="rec-body">{{ content.daily.cases[0].summary }}</div>
      </div>

      <div
        v-if="content.daily.shiwu && content.daily.shiwu.material"
        class="card rec-card"
        style="border-left-color:var(--sw)"
      >
        <div class="rec-head">
          <span class="tag sw">实务 · 每日素材</span>
          <span style="font-size:11px;color:var(--text-3)">可练：消息 / 标题 / 纠错</span>
        </div>
        <div class="rec-title">{{ content.daily.shiwu.material.title }}</div>
        <div class="rec-body">{{ content.daily.shiwu.material.body }}</div>
      </div>
    </template>
    <div v-else-if="content.loading" class="card" style="text-align:center;color:var(--text-3);font-size:13px">
      正在加载今日内容…
    </div>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/settings')">设置 · 考试日与目标</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>
