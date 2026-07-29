import type { Checkin, Task } from '@/db'

/**
 * 打卡判定与连续天数（构建框架.md §7.2）。
 * 纯函数，不碰 DOM/Vue。
 */

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** 当日任务完成统计 */
export interface DayStat {
  doneCount: number
  totalCount: number
  rate: number // 0~1，totalCount 为 0 时记 0
}

export function dayStat(tasks: Task[]): DayStat {
  const totalCount = tasks.length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  return {
    doneCount,
    totalCount,
    rate: totalCount === 0 ? 0 : doneCount / totalCount
  }
}

/** 是否全部完成（可打卡） */
export function isAllDone(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.status === 'done')
}

/**
 * 热力图档位（§7.2）：
 * 完成率 ≥100% l4，≥75% l3，≥40% l2，>0% l1，否则 l0（未打卡/空）。
 */
export function heatLevel(rate: number): HeatLevel {
  if (rate >= 1) return 4
  if (rate >= 0.75) return 3
  if (rate >= 0.4) return 2
  if (rate > 0) return 1
  return 0
}

/**
 * 计算今日打卡后的连续天数（§7.2）：
 * 昨天（前一日）有打卡记录 → 昨日 streak + 1；昨天无记录 → 1。
 *
 * @param yesterdayCheckin 前一日的打卡记录（可能为 undefined）
 */
export function nextStreak(yesterdayCheckin: Checkin | undefined): number {
  if (!yesterdayCheckin) return 1
  return yesterdayCheckin.streak + 1
}

/**
 * 构造一条打卡记录（纯：不写库，只算值）。
 */
export function buildCheckin(
  date: string,
  tasks: Task[],
  yesterdayCheckin: Checkin | undefined
): Checkin {
  const { doneCount, totalCount } = dayStat(tasks)
  return {
    date,
    doneCount,
    totalCount,
    streak: nextStreak(yesterdayCheckin)
  }
}
