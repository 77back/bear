import type { PracticeLog, PracticeQtype } from './types'
import { todayStr, addDays, parseDate } from './dates'

/**
 * 推荐规则（构建框架.md §7.5）。规则引擎，不用算法。纯函数。
 */

export const PRACTICE_QTYPES: PracticeQtype[] = ['消息', '评论', '策划', '纠错', '标题']

/**
 * 实务推荐：近 days 天各 qtype 练习次数最少者（§7.5）。
 * 次数并列时取规范顺序最前者；全部为 0 也返回最前者（鼓励先练消息）。
 */
export function leastPracticedQtype(
  logs: PracticeLog[],
  days = 14,
  now: Date = new Date()
): PracticeQtype {
  const from = todayStr(addDays(now, -(days - 1)))
  const win = logs.filter((l) => l.date >= from)
  const counts = {} as Record<PracticeQtype, number>
  for (const q of PRACTICE_QTYPES) counts[q] = 0
  for (const l of win) if (l.qtype in counts) counts[l.qtype]++
  let min = Infinity
  let pick: PracticeQtype = PRACTICE_QTYPES[0]
  for (const q of PRACTICE_QTYPES) {
    if (counts[q] < min) {
      min = counts[q]
      pick = q
    }
  }
  return pick
}

/** 近 days 天各题型练习次数（展示用） */
export function qtypeCounts(
  logs: PracticeLog[],
  days = 14,
  now: Date = new Date()
): Record<PracticeQtype, number> {
  const from = todayStr(addDays(now, -(days - 1)))
  const win = logs.filter((l) => l.date >= from)
  const counts = {} as Record<PracticeQtype, number>
  for (const q of PRACTICE_QTYPES) counts[q] = 0
  for (const l of win) if (l.qtype in counts) counts[l.qtype]++
  return counts
}

/**
 * 时政置顶：考试日 <30 天时今日页置顶当月时政统计（§7.5）。
 */
export function shizhengPriority(examDate: string, now: Date = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = parseDate(examDate).getTime() - today.getTime()
  const days = Math.round(diff / 86400000)
  return days >= 0 && days < 30
}
