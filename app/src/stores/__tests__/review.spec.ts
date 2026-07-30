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

describe('review store（归档入案例库）', () => {
  // stage 间隔 [0,1,3,7,15]：收藏于 2026-07-29，各 stage 到期日如下
  const stageDays: [number, number, number][] = [
    [2026, 7, 29],
    [2026, 7, 30],
    [2026, 8, 1],
    [2026, 8, 5],
    [2026, 8, 13]
  ]

  async function setup() {
    const r = useReviewStore()
    const t = useTaskStore()
    await t.load()
    await r.load()
    return r
  }

  async function completeDueOf(r: ReturnType<typeof useReviewStore>, materialId: number) {
    const due = r.due.find((x) => x.materialId === materialId)
    expect(due).toBeTruthy()
    return r.complete(due!.id!)
  }

  it('走完最后一个 stage → 素材自动归档（complete 返回 true 并持久化）', async () => {
    const r = await setup()
    setDay(2026, 7, 29)
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区' })

    for (let i = 0; i < 4; i++) {
      setDay(...stageDays[i])
      await r.load()
      expect(await completeDueOf(r, id)).toBe(false) // 中途不归档
      expect(r.materialOf(id)!.archived).toBeFalsy()
    }

    setDay(...stageDays[4]) // 第16天，最后一个 stage
    await r.load()
    expect(await completeDueOf(r, id)).toBe(true)
    expect(r.materialOf(id)!.archived).toBe(true)
    expect((await db.materials.get(id))!.archived).toBe(true)
    // 重新加载后归档状态仍在
    await r.load()
    expect(r.materialOf(id)!.archived).toBe(true)
  })

  it('仅完成部分 stage → 不归档', async () => {
    const r = await setup()
    setDay(2026, 7, 29)
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区' })
    expect(await completeDueOf(r, id)).toBe(false) // stage0
    setDay(2026, 7, 30)
    await r.load()
    expect(await completeDueOf(r, id)).toBe(false) // stage1
    expect(r.materialOf(id)!.archived).toBeFalsy()
    expect((await db.materials.get(id))!.archived).toBeFalsy()
  })

  it('complete 幂等：重复完成同一 Review 不重复归档', async () => {
    const r = await setup()
    setDay(2026, 7, 29)
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区' })
    for (const d of stageDays) {
      setDay(...d)
      await r.load()
      await completeDueOf(r, id)
    }
    expect(r.materialOf(id)!.archived).toBe(true)
    // 已完成的 Review 再次 complete → 无操作
    const rid = r.reviews.find((x) => x.materialId === id && x.stage === 4)!.id!
    expect(await r.complete(rid)).toBe(false)
    // 不存在的 id → 无操作
    expect(await r.complete(99999)).toBe(false)
  })

  it('归档只影响自身素材，不影响其他素材', async () => {
    const r = await setup()
    setDay(2026, 7, 29)
    const a = await r.collect({ type: 'case', title: '甲', body: 'a' })
    const b = await r.collect({ type: 'case', title: '乙', body: 'b' })
    for (const d of stageDays) {
      setDay(...d)
      await r.load()
      await completeDueOf(r, a)
    }
    expect(r.materialOf(a)!.archived).toBe(true)
    expect(r.materialOf(b)!.archived).toBeFalsy()
  })

  it('已归档素材 removeMaterial 照常删除（素材与 Review 一并清除）', async () => {
    const r = await setup()
    setDay(2026, 7, 29)
    const id = await r.collect({ type: 'case', title: '林丹', body: '社区' })
    for (const d of stageDays) {
      setDay(...d)
      await r.load()
      await completeDueOf(r, id)
    }
    expect(r.materialOf(id)!.archived).toBe(true)
    await r.removeMaterial(id)
    expect(r.collectedCount).toBe(0)
    expect(r.reviews.length).toBe(0)
    expect(await db.materials.get(id)).toBeUndefined()
  })
})
