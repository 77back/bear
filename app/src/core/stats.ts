import type { QuizLog, QuizModule } from '@/db'
import { todayStr, addDays } from '@/db'

/**
 * 行测统计聚合（构建框架.md §7.4）。纯函数，不碰 DOM/Vue。
 * 所有"近 N 天"以传入 now 为基准（便于测试）。
 */

export const QUIZ_MODULES: QuizModule[] = ['言语', '判断', '数量', '资料', '常识']

export interface ModuleStat {
  module: QuizModule
  total: number
  correct: number
  rate: number // 0~1，total=0 记 0
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

/** 窗口起止日期串（含端点），窗口长度 sinceDays 天 */
export function windowFrom(sinceDays: number, now: Date): string {
  return todayStr(addDays(now, -(sinceDays - 1)))
}

/** 仅取窗口内日志 */
export function inWindow(logs: QuizLog[], sinceDays: number, now: Date): QuizLog[] {
  const from = windowFrom(sinceDays, now)
  return logs.filter((l) => l.date >= from)
}

/** 不做窗口过滤的模块汇总 */
function moduleStatsRaw(logs: QuizLog[]): ModuleStat[] {
  return QUIZ_MODULES.map((m) => {
    const ml = logs.filter((l) => l.module === m)
    const total = sum(ml.map((l) => l.total))
    const correct = sum(ml.map((l) => l.correct))
    return { module: m, total, correct, rate: total === 0 ? 0 : correct / total }
  })
}

/** 近 sinceDays 天各板块进度（§7.4 板块进度） */
export function moduleProgress(logs: QuizLog[], sinceDays = 30, now = new Date()): ModuleStat[] {
  return moduleStatsRaw(inWindow(logs, sinceDays, now))
}

export interface DayTrend {
  date: string // 'YYYY-MM-DD'
  rate: number // 当天聚合正确率，无记录记 0
  total: number // 当天题量
}

/** 近 days 天按天聚合正确率（§7.4 趋势），无记录的日期补 0 占位 */
export function dailyTrend(logs: QuizLog[], days = 14, now = new Date()): DayTrend[] {
  const win = inWindow(logs, days, now)
  const byDate = new Map<string, { c: number; t: number }>()
  for (const l of win) {
    const e = byDate.get(l.date) ?? { c: 0, t: 0 }
    e.c += l.correct
    e.t += l.total
    byDate.set(l.date, e)
  }
  const out: DayTrend[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = todayStr(addDays(now, -i))
    const e = byDate.get(d) ?? { c: 0, t: 0 }
    out.push({ date: d, rate: e.t === 0 ? 0 : e.c / e.t, total: e.t })
  }
  return out
}

export interface WeakPoint {
  name: string
  count?: number // 词频（细粒度模式）
  rate?: number // 模块正确率（垫底模式）
  isModule: boolean
}

/**
 * 薄弱点（§7.4）：近 sinceDays 天 weakPoints 词频 Top n；
 * 暂无细粒度时退化为「模块正确率垫底者」（有数据的，按 rate 升序）。
 */
export function weakPoints(logs: QuizLog[], sinceDays = 30, n = 5, now = new Date()): WeakPoint[] {
  const win = inWindow(logs, sinceDays, now)
  const freq = new Map<string, number>()
  for (const l of win) for (const w of l.weakPoints ?? []) freq.set(w, (freq.get(w) ?? 0) + 1)
  if (freq.size > 0) {
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, count, isModule: false }))
  }
  // 垫底模块（仅有数据的）
  return moduleStatsRaw(win)
    .filter((m) => m.total > 0)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, n)
    .map((m) => ({ name: m.module, rate: m.rate, isModule: true }))
}

/** 本周题量与环比（§7.4 周/月小结：题量、环比） */
export interface WeeklyVolume {
  thisWeek: number
  lastWeek: number
  momDelta: number // 本周 - 上周
}

export function weeklyVolume(logs: QuizLog[], now = new Date()): WeeklyVolume {
  const thisFrom = todayStr(addDays(now, -6)) // 近 7 天（含今天）
  const lastFrom = todayStr(addDays(now, -13))
  const lastTo = todayStr(addDays(now, -7))
  const thisWeek = sum(logs.filter((l) => l.date >= thisFrom).map((l) => l.total))
  const lastWeek = sum(
    logs.filter((l) => l.date >= lastFrom && l.date <= lastTo).map((l) => l.total)
  )
  return { thisWeek, lastWeek, momDelta: thisWeek - lastWeek }
}

/** 各模块近 7 天 vs 上 7 天正确率差值（趋势箭头用） */
export function moduleRecentDelta(logs: QuizLog[], now = new Date()): Record<QuizModule, number> {
  const thisFrom = todayStr(addDays(now, -6))
  const lastFrom = todayStr(addDays(now, -13))
  const lastTo = todayStr(addDays(now, -7))
  const rate = (arr: QuizLog[]) => {
    const t = sum(arr.map((l) => l.total))
    return t === 0 ? null : sum(arr.map((l) => l.correct)) / t
  }
  const out = {} as Record<QuizModule, number>
  for (const m of QUIZ_MODULES) {
    const tr = rate(logs.filter((l) => l.module === m && l.date >= thisFrom))
    const lr = rate(logs.filter((l) => l.module === m && l.date >= lastFrom && l.date <= lastTo))
    out[m] = tr != null && lr != null ? tr - lr : 0
  }
  return out
}

/**
 * 下周任务建议文案（验收：正确率 <65% 板块的建议出现）。
 * 返回空串表示无需建议。
 */
export function advise(modules: ModuleStat[]): string {
  const weak = modules.filter((m) => m.total > 0 && m.rate < 0.65)
  if (weak.length === 0) {
    const hasData = modules.some((m) => m.total > 0)
    return hasData ? '各板块正确率均达标，保持当前节奏即可。' : '暂无刷题数据，先录入一组刷题记录吧。'
  }
  const names = weak.sort((a, b) => a.rate - b.rate).map((m) => `${m.module}（${Math.round(m.rate * 100)}%）`)
  return `${names.join('、')} 正确率偏低，建议下周每日加练对应专项。`
}
