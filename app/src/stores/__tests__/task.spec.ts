import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../task'
import { db } from '@/db'

/**
 * store + Dexie 集成测试：验证打卡写入 IndexedDB、跨天 streak 续接/中断、
 * 撤销打卡一致性。用 fake-indexeddb + 假时钟。
 *
 * 关键：只 fake Date（保持 setTimeout 真实），否则 fake-indexeddb 内部定时器
 * 会被冻住导致挂起。
 */

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

describe('今日任务 store（阶段1 集成）', () => {
  it('首次 load：当日无任务 → 填充启动模板（6 条，全 todo）', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    expect(s.tasks.length).toBe(6)
    expect(s.stat.doneCount).toBe(0)
    expect(s.progressText).toBe('0/6')
    expect(s.currentStreak).toBe(0)
  })

  it('勾选全部 → 进度联动 6/6；打卡成功写入 checkins，streak=1', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    for (const t of s.tasks) await s.toggle(t.id!)
    expect(s.allDone).toBe(true)
    expect(s.progressText).toBe('6/6')

    const r = await s.checkin()
    expect(r.ok).toBe(true)
    expect(s.todayCheckedIn).toBe(true)
    expect(s.currentStreak).toBe(1)

    const rec = await db.checkins.get('2026-07-29')
    expect(rec).toMatchObject({ doneCount: 6, totalCount: 6, streak: 1 })
  })

  it('未全部完成时打卡被拒', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    await s.toggle(s.tasks[0].id!) // 只完成 1
    const r = await s.checkin()
    expect(r.ok).toBe(false)
    expect(await db.checkins.get('2026-07-29')).toBeUndefined()
  })

  it('跨天 streak 续接：次日全部完成打卡 → streak=2', async () => {
    // 第1天
    setDay(2026, 7, 29)
    let s = useTaskStore()
    await s.load()
    for (const t of s.tasks) await s.toggle(t.id!)
    await s.checkin()
    expect(s.currentStreak).toBe(1)

    // 第2天
    setDay(2026, 7, 30)
    await s.load() // 新一天，种子新任务
    expect(s.currentStreak).toBe(1) // 沿用昨日 streak（尚未今日打卡）
    for (const t of s.tasks) await s.toggle(t.id!)
    const r = await s.checkin()
    expect(r.ok).toBe(true)
    expect(s.currentStreak).toBe(2)
    expect((await db.checkins.get('2026-07-30'))!.streak).toBe(2)
  })

  it('streak 中断：隔一天未打卡后，下次打卡重置为 1', async () => {
    setDay(2026, 7, 29)
    let s = useTaskStore()
    await s.load()
    for (const t of s.tasks) await s.toggle(t.id!)
    await s.checkin() // streak 1

    // 7-30 跳过（不打卡）
    // 7-31：昨日(7-30)无 checkin → 重置
    setDay(2026, 7, 31)
    await s.load()
    expect(s.currentStreak).toBe(0) // 昨日无记录
    for (const t of s.tasks) await s.toggle(t.id!)
    const r = await s.checkin()
    expect(r.ok).toBe(true)
    expect(s.currentStreak).toBe(1)
  })

  it('撤销：打卡后把任一任务改回 todo → 自动撤销当日打卡', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    for (const t of s.tasks) await s.toggle(t.id!)
    await s.checkin()
    expect(await db.checkins.get('2026-07-29')).toBeTruthy()

    await s.toggle(s.tasks[0].id!) // 改回 todo
    expect(s.todayCheckedIn).toBe(false)
    expect(await db.checkins.get('2026-07-29')).toBeUndefined()
  })

  it('持久化：刷新(重新 load)后任务状态不丢', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    await s.toggle(s.tasks[0].id!)
    await s.toggle(s.tasks[1].id!)

    const s2 = useTaskStore()
    await s2.load()
    expect(s2.stat.doneCount).toBe(2)
    expect(s2.tasks.length).toBe(6) // 不会重复种子
  })

  it('热力图：当日完成率反映在日历档位', async () => {
    setDay(2026, 7, 29)
    const s = useTaskStore()
    await s.load()
    for (const t of s.tasks) await s.toggle(t.id!)
    await s.checkin()
    await s.loadCalendar(new Date(2026, 6, 29))
    const todayCell = s.monthCells.find((c) => c.date === '2026-07-29')
    expect(todayCell?.level).toBe(4) // 100% → l4
  })
})
