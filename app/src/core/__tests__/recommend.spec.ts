import { describe, it, expect } from 'vitest'
import { leastPracticedQtype, qtypeCounts, shizhengPriority, PRACTICE_QTYPES } from '../recommend'
import type { PracticeLog } from '@/db'

const NOW = new Date(2026, 6, 29)

function pl(date: string, qtype: PracticeLog['qtype']): PracticeLog {
  return { date, qtype }
}

describe('leastPracticedQtype（§7.5 实务推荐）', () => {
  it('返回近 14 天练习次数最少的题型', () => {
    const logs = [
      pl('2026-07-20', '评论'),
      pl('2026-07-22', '策划'),
      pl('2026-07-28', '标题'),
      pl('2026-07-28', '纠错')
    ] // 消息=0 最少
    expect(leastPracticedQtype(logs, 14, NOW)).toBe('消息')
  })

  it('全部并列 0 → 取规范顺序首个（消息）', () => {
    expect(leastPracticedQtype([], 14, NOW)).toBe('消息')
  })

  it('窗口外的不计入', () => {
    const logs = [
      pl('2026-06-01', '消息'),
      pl('2026-06-02', '消息')
    ] // 30+ 天前，全部当期为 0 → 消息
    expect(leastPracticedQtype(logs, 14, NOW)).toBe('消息')
  })

  it('并列最少取规范顺序靠前者', () => {
    // 评论、策划均为 1，其余 0 → 最少(0)的是 消息/纠错/标题，取首个 消息
    const logs = [pl('2026-07-28', '评论'), pl('2026-07-28', '策划')]
    expect(leastPracticedQtype(logs, 14, NOW)).toBe('消息')
  })
})

describe('qtypeCounts', () => {
  it('统计各题型次数', () => {
    const counts = qtypeCounts([pl('2026-07-28', '消息'), pl('2026-07-28', '消息'), pl('2026-07-29', '标题')], 14, NOW)
    expect(counts['消息']).toBe(2)
    expect(counts['标题']).toBe(1)
    expect(counts['策划']).toBe(0)
    expect(PRACTICE_QTYPES).toHaveLength(5)
  })
})

describe('shizhengPriority（§7.5 考试日<30天置顶时政）', () => {
  it('距考 <30 天 → true', () => {
    expect(shizhengPriority('2026-08-15', NOW)).toBe(true) // 17 天
  })
  it('距考 ≥30 天 → false', () => {
    expect(shizhengPriority('2026-11-27', NOW)).toBe(false)
  })
  it('考试已过 → false', () => {
    expect(shizhengPriority('2026-06-01', NOW)).toBe(false)
  })
})
