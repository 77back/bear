import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, todayStr, type QuizLog, type QuizModule } from '@/db'
import { getSetting } from '@/db/seed'
import {
  moduleProgress,
  dailyTrend,
  weakPoints,
  weeklyVolume,
  advise,
  moduleRecentDelta,
  type ModuleStat,
  type DayTrend,
  type WeakPoint
} from '@/core/stats'

/** 刷题录入入参（题目库不做，仅录一组正确数） */
export interface QuizInput {
  module: QuizModule
  total: number
  correct: number
  seconds?: number
  weakPoints?: string[]
}

export const useStatsStore = defineStore('stats', () => {
  const logs = ref<QuizLog[]>([])
  const weeklyGoal = ref(300)

  async function load() {
    logs.value = await db.quizLogs.toArray()
    weeklyGoal.value = await getSetting('weeklyGoal', 300)
  }

  async function record(input: QuizInput): Promise<void> {
    const entry: QuizLog = { ...input, date: todayStr() }
    const id = await db.quizLogs.add(entry)
    logs.value.push({ ...entry, id })
  }

  async function clearAll(): Promise<void> {
    await db.quizLogs.clear()
    logs.value = []
  }

  // §7.4 派生
  const modules = computed<ModuleStat[]>(() => moduleProgress(logs.value, 30))
  const trend = computed<DayTrend[]>(() => dailyTrend(logs.value, 14))
  const weak = computed<WeakPoint[]>(() => weakPoints(logs.value, 30, 5))
  const weekly = computed(() => weeklyVolume(logs.value))
  const delta = computed(() => moduleRecentDelta(logs.value))
  const advice = computed(() => advise(modules.value))

  // 周目标环
  const weekDone = computed(() => weekly.value.thisWeek)
  const ringPct = computed(() =>
    weeklyGoal.value > 0 ? Math.min(1, weekDone.value / weeklyGoal.value) : 0
  )

  return {
    logs,
    weeklyGoal,
    load,
    record,
    clearAll,
    modules,
    trend,
    weak,
    weekly,
    delta,
    advice,
    weekDone,
    ringPct
  }
})
