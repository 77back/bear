import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReviewStore } from '../review'
import { useTaskStore } from '../task'
import { db } from '@/db'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

function setDay(y: number, m: number, d: number) {
  vi.setSystemTime(new Date(y, m - 1, d, 9, 0, 0))
}

describe('review store（阶段4 集成）', () => {
  it('收藏素材 → 生成 5 条 Review，stage0 当日到期', async () => {
    setDay(2026, 7, 29)
    const r = useReviewStore()
    const t = useTaskStore()
    await t.load()
    await r.load()
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区治理', domains: ['基层治理'] })
    expect(id).toBeGreaterThan(0)
    expect(r.collectedCount).toBe(1)
    expect(r.reviews.length).toBe(5)
    expect(r.dueCount).toBe(1) // 仅 stage0
    expect((await db.reviews.where('materialId').equals(id).toArray()).length).toBe(5)
  })

  it('收藏后次日复习出现 stage1（验收点）', async () => {
    setDay(2026, 7, 29)
    const r = useReviewStore()
    const t = useTaskStore()
    await t.load()
    await r.load()
    await r.collect({ type: 'case', title: '林丹', body: '社区' })
    expect(r.due.map((x) => x.stage)).toEqual([0])

    setDay(2026, 7, 30) // 次日
    await r.load()
    const stages = r.due.map((x) => x.stage)
    expect(stages).toContain(1) // stage1 出现
    expect(stages).toContain(0) // stage0 逾期并入
  })

  it('完成复习 → 移出 due；复习完成计入当日任务（task 置 done）', async () => {
    setDay(2026, 7, 29)
    const r = useReviewStore()
    const t = useTaskStore()
    await t.load()
    await r.load()
    await r.collect({ type: 'case', title: '林丹', body: '社区' })

    // 有待复习 → 申论复习任务应为 todo
    const taskBefore = t.tasks.find((x) => x.title === '申论 · 复习到期案例')
    expect(taskBefore?.status).toBe('todo')

    const rid = r.due[0].id!
    await r.complete(rid)
    expect(r.dueCount).toBe(0)
    // 无待复习 → 任务置 done
    const taskAfter = t.tasks.find((x) => x.title === '申论 · 复习到期案例')
    expect(taskAfter?.status).toBe('done')
  })

  it('删除素材 → 同步删除其 Review', async () => {
    setDay(2026, 7, 29)
    const r = useReviewStore()
    const t = useTaskStore()
    await t.load()
    await r.load()
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区' })
    await r.removeMaterial(id)
    expect(r.collectedCount).toBe(0)
    expect(r.reviews.length).toBe(0)
  })

  it('未收藏任何素材 → 复习任务保持初始状态（review store 不自动改动）', async () => {
    setDay(2026, 7, 29)
    const t = useTaskStore()
    const r = useReviewStore()
    await t.load()
    await r.load()
    // starter 已含复习任务且为 todo；review store 在无 reviews 时不介入
    expect(r.dueCount).toBe(0)
    expect(r.collectedCount).toBe(0)
  })
})
