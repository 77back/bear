import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStatsStore } from '../stats'
import { db } from '@/db'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('stats store（阶段2 集成）', () => {
  it('load 后 logs 为空 → 派生全空，环 0%', async () => {
    const s = useStatsStore()
    await s.load()
    expect(s.logs.length).toBe(0)
    expect(s.weekDone).toBe(0)
    expect(s.ringPct).toBe(0)
    expect(s.modules.every((m) => m.total === 0)).toBe(true)
  })

  it('record 写入 quizLogs，模块进度与周环更新', async () => {
    const s = useStatsStore()
    await s.load()
    await s.record({ module: '言语', total: 20, correct: 16 })
    await s.record({ module: '数量', total: 10, correct: 5 })

    // 持久化
    expect((await db.quizLogs.toArray()).length).toBe(2)
    const yan = s.modules.find((m) => m.module === '言语')!
    expect(yan.total).toBe(20)
    expect(yan.rate).toBe(0.8)
    // 周环：本周 30 题
    expect(s.weekDone).toBe(30)
    // 默认周目标 300 → 10%
    expect(s.ringPct).toBeCloseTo(0.1, 5)
  })

  it('正确率<65% 板块出现在建议文案', async () => {
    const s = useStatsStore()
    await s.load()
    await s.record({ module: '数量', total: 10, correct: 6 }) // 60%
    expect(s.advice).toContain('数量')
  })

  it('薄弱知识点 fallback 到模块垫底（无 weakPoints）', async () => {
    const s = useStatsStore()
    await s.load()
    await s.record({ module: '数量', total: 10, correct: 4 }) // 40% 最弱
    await s.record({ module: '言语', total: 10, correct: 9 })
    expect(s.weak[0]).toMatchObject({ name: '数量', isModule: true })
  })

  it('weakPoints 词频聚合', async () => {
    const s = useStatsStore()
    await s.load()
    await s.record({ module: '数量', total: 10, correct: 5, weakPoints: ['排列组合', '排列组合'] })
    await s.record({ module: '言语', total: 10, correct: 6, weakPoints: ['逻辑填空'] })
    expect(s.weak[0]).toMatchObject({ name: '排列组合', count: 2, isModule: false })
  })
})
