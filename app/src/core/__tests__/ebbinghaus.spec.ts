import { describe, it, expect } from 'vitest'
import { createReviews, dueReviews, stageBuckets, STAGE_INTERVALS, dueDateForStage } from '../ebbinghaus'

// 固定收藏时间：2026-07-29 00:00 本地
const COLLECTED = new Date(2026, 6, 29, 0, 0, 0).getTime()

describe('createReviews（§7.3 调度）', () => {
  it('生成 5 条 Review，stage 0~4', () => {
    const rs = createReviews(1, COLLECTED)
    expect(rs).toHaveLength(5)
    expect(rs.map((r) => r.stage)).toEqual([0, 1, 2, 3, 4])
    expect(rs.every((r) => !r.doneAt && r.materialId === 1)).toBe(true)
  })

  it('到期日 = 收藏日 + [0,1,3,7,15] 天', () => {
    const rs = createReviews(1, COLLECTED)
    expect(rs[0].dueDate).toBe('2026-07-29') // +0
    expect(rs[1].dueDate).toBe('2026-07-30') // +1
    expect(rs[2].dueDate).toBe('2026-08-01') // +3
    expect(rs[3].dueDate).toBe('2026-08-05') // +7
    expect(rs[4].dueDate).toBe('2026-08-13') // +15
  })

  it('STAGE_INTERVALS 与规格一致', () => {
    expect([...STAGE_INTERVALS]).toEqual([0, 1, 3, 7, 15])
  })
})

describe('dueReviews（逾期合并）', () => {
  const rs = createReviews(1, COLLECTED)

  it('收藏当日(today=收藏日)：仅 stage0 到期', () => {
    expect(dueReviews(rs, '2026-07-29').map((r) => r.stage)).toEqual([0])
  })

  it('次日：stage0、stage1 都到期（逾期未做的并入）', () => {
    expect(dueReviews(rs, '2026-07-30').map((r) => r.stage)).toEqual([0, 1])
  })

  it('多日未做：所有到期项按 dueDate/stage 升序全列出（逾期合并）', () => {
    // 8月6日：stage0(+0)、1(+1)、2(+3)、3(+7) 都 ≤ 今天
    const due = dueReviews(rs, '2026-08-06').map((r) => r.stage)
    expect(due).toEqual([0, 1, 2, 3])
  })

  it('已完成(doneAt)的项不再出现', () => {
    const done0 = rs.map((r) => (r.stage === 0 ? { ...r, doneAt: 1 } : r))
    expect(dueReviews(done0, '2026-07-29')).toEqual([])
  })

  it('未到期的不出现', () => {
    expect(dueReviews(rs, '2026-07-28')).toEqual([]) // 收藏前一天
  })
})

describe('stageBuckets', () => {
  it('按 stage 计数', () => {
    const rs = createReviews(1, COLLECTED)
    const b = stageBuckets(rs, '2026-08-06')
    expect(b[0]).toBe(1)
    expect(b[3]).toBe(1)
    expect(b[4]).toBe(0) // +15 = 8/13 未到
  })
})

describe('dueDateForStage', () => {
  it('跨月正确', () => {
    expect(dueDateForStage(COLLECTED, 4)).toBe('2026-08-13')
  })
})
