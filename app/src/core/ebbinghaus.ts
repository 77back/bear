import type { Review, ReviewStage } from '@/db'
import { todayStr, addDays } from '@/db'

/**
 * 艾宾浩斯复习调度（构建框架.md §7.3）。纯函数，不碰 DOM/Vue。
 * stage 0~4 对应间隔 [0(收藏当日), 1, 3, 7, 15] 天。
 */

export const STAGE_INTERVALS = [0, 1, 3, 7, 15] as const

export const STAGE_LABEL: Record<ReviewStage, string> = {
  0: '第1天',
  1: '第2天',
  2: '第4天',
  3: '第8天',
  4: '第16天'
}

/** 某 stage 的到期日（'YYYY-MM-DD'），基于收藏时间戳 */
export function dueDateForStage(collectedAt: number, stage: ReviewStage): string {
  return todayStr(addDays(new Date(collectedAt), STAGE_INTERVALS[stage]))
}

/** 收藏素材 → 生成 5 条 Review（stage 0~4，全部未完成） */
export function createReviews(materialId: number, collectedAt: number): Review[] {
  return ([0, 1, 2, 3, 4] as ReviewStage[]).map((stage) => ({
    materialId,
    stage,
    dueDate: dueDateForStage(collectedAt, stage)
  }))
}

/**
 * 今日待复习：dueDate ≤ today 且未完成，按 dueDate 升序、stage 升序。
 * 逾期未做的全部并入口径（§7.3 逾期合并）。
 */
export function dueReviews(reviews: Review[], today: string): Review[] {
  return reviews
    .filter((r) => !r.doneAt && r.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.stage - b.stage)
}

/** 按 stage 分桶计数（用于「第1天·N项」展示） */
export function stageBuckets(reviews: Review[], today: string): Record<ReviewStage, number> {
  const out: Record<ReviewStage, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const r of dueReviews(reviews, today)) out[r.stage]++
  return out
}
