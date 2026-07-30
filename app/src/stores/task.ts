import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, todayStr, addDays, type Task, type Subject } from '@/db'
import { dayStat, isAllDone, buildCheckin } from '@/core/checkin'
import { starterTemplate, materializeTasks } from '@/core/planner'
import { buildMonthCalendar, weekHead, type CalCell } from '@/core/calendar'

/**
 * 今日任务 / 打卡 / 日历 store（阶段 1）。
 */
export const useTaskStore = defineStore('task', () => {
  const today = ref(todayStr())
  const tasks = ref<Task[]>([])
  const currentStreak = ref(0)
  const todayCheckedIn = ref(false)
  const calMonth = ref({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 })
  const monthCells = ref<CalCell[]>([])

  const stat = computed(() => dayStat(tasks.value))
  const allDone = computed(() => isAllDone(tasks.value))
  const progressText = computed(() => `${stat.value.doneCount}/${stat.value.totalCount}`)
  const progressPct = computed(() =>
    stat.value.totalCount === 0 ? 0 : (stat.value.doneCount / stat.value.totalCount) * 100
  )

  function pad(n: number) {
    return String(n).padStart(2, '0')
  }

  async function load() {
    today.value = todayStr()

    // 当日无任务 → 填充启动模板（阶段1 手动维护）
    let todays = await db.tasks.where('date').equals(today.value).toArray()
    if (todays.length === 0) {
      await db.tasks.bulkAdd(materializeTasks(today.value, starterTemplate()))
      todays = await db.tasks.where('date').equals(today.value).toArray()
    }
    tasks.value = todays.sort((a, b) => (a.id! - b.id!))

    // 打卡状态 + 连续天数
    const todaysCheckin = await db.checkins.get(today.value)
    todayCheckedIn.value = !!todaysCheckin
    const yestCheckin = await db.checkins.get(todayStr(addDays(new Date(), -1)))
    currentStreak.value = todaysCheckin?.streak ?? yestCheckin?.streak ?? 0

    await loadCalendar(new Date())
  }

  async function loadCalendar(base: Date) {
    const y = base.getFullYear()
    const m = base.getMonth() + 1
    calMonth.value = { y, m }
    const prefix = `${y}-${pad(m)}`
    const inMonth = await db.tasks.where('date').startsWith(prefix).toArray()
    const byDate = new Map<string, Task[]>()
    for (const t of inMonth) {
      const arr = byDate.get(t.date) ?? []
      arr.push(t)
      byDate.set(t.date, arr)
    }
    const rateByDate = new Map<string, number>()
    byDate.forEach((list, date) => rateByDate.set(date, dayStat(list).rate))
    monthCells.value = buildMonthCalendar(y, m, rateByDate)
  }

  async function toggle(id: number) {
    const t = tasks.value.find((x) => x.id === id)
    if (!t) return
    t.status = t.status === 'done' ? 'todo' : 'done'
    t.doneAt = t.status === 'done' ? Date.now() : undefined
    await db.tasks.update(id, { status: t.status, doneAt: t.doneAt })
    // 已打卡后取消完成 → 撤销当日打卡（保持数据一致）
    if (todayCheckedIn.value && t.status === 'todo') {
      await db.checkins.delete(today.value)
      todayCheckedIn.value = false
      const yest = await db.checkins.get(todayStr(addDays(new Date(), -1)))
      currentStreak.value = yest?.streak ?? 0
    }
  }

  async function addTask(subject: Subject, title: string, meta?: string) {
    const t: Task = { date: today.value, subject, title, meta, status: 'todo' }
    const id = await db.tasks.add(t)
    tasks.value.push({ ...t, id })
  }

  async function removeTask(id: number) {
    await db.tasks.delete(id)
    tasks.value = tasks.value.filter((x) => x.id !== id)
  }

  /** 编辑已有任务的标题/备注；title 为空或 id 不存在时拒绝（保持原样） */
  async function updateTask(id: number, patch: { title?: string; meta?: string }) {
    const t = tasks.value.find((x) => x.id === id)
    if (!t) return
    if (patch.title !== undefined && !patch.title.trim()) return
    const changes: { title?: string; meta?: string } = {}
    if (patch.title !== undefined) changes.title = patch.title.trim()
    if (patch.meta !== undefined) changes.meta = patch.meta
    await db.tasks.update(id, changes)
    Object.assign(t, changes)
  }

  // ---- 申论复习任务接入（阶段4）：复习完成计入当日任务 ----
  const REVIEW_TASK_TITLE = '申论 · 复习到期案例'

  /** 确保今日存在申论复习任务（无则创建） */
  async function ensureReviewTask() {
    if (tasks.value.some((t) => t.title === REVIEW_TASK_TITLE)) return
    await addTask('sl', REVIEW_TASK_TITLE, '遗忘曲线复习')
  }

  /** 设置申论复习任务状态（done = 今日无待复习；todo = 还有待复习） */
  async function setReviewTaskStatus(done: boolean) {
    const t = tasks.value.find((x) => x.title === REVIEW_TASK_TITLE)
    if (!t || t.id == null) return
    const target: Task['status'] = done ? 'done' : 'todo'
    if (t.status === target) return
    t.status = target
    t.doneAt = done ? Date.now() : undefined
    await db.tasks.update(t.id, { status: t.status, doneAt: t.doneAt })
  }

  /** 打卡：全部完成才成功 */
  async function checkin(): Promise<{ ok: boolean; msg: string }> {
    if (!allDone.value) {
      return { ok: false, msg: `还有 ${stat.value.totalCount - stat.value.doneCount} 项任务未完成，加油！` }
    }
    const yest = await db.checkins.get(todayStr(addDays(new Date(), -1)))
    const rec = buildCheckin(today.value, tasks.value, yest)
    await db.checkins.put(rec)
    todayCheckedIn.value = true
    currentStreak.value = rec.streak
    await loadCalendar(new Date())
    return { ok: true, msg: `打卡成功！连续打卡 ${rec.streak} 天，继续保持` }
  }

  return {
    today,
    tasks,
    currentStreak,
    todayCheckedIn,
    calMonth,
    monthCells,
    stat,
    allDone,
    progressText,
    progressPct,
    weekHead,
    load,
    loadCalendar,
    toggle,
    addTask,
    removeTask,
    updateTask,
    ensureReviewTask,
    setReviewTaskStatus,
    checkin
  }
})
