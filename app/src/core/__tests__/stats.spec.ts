import { describe, it, expect } from 'vitest'
import {
  moduleProgress,
  dailyTrend,
  weakPoints,
  weeklyVolume,
  advise,
  windowFrom
} from '../stats'
import type { QuizLog } from '@/db'

const NOW = new Date(2026, 6, 29) // 2026-07-29

function log(date: string, module: QuizLog['module'], total: number, correct: number, weak?: string[]): QuizLog {
  return { date, module, total, correct, weakPoints: weak }
}

describe('moduleProgress（§7.4 板块进度）', () => {
  it('近 30 天汇总各模块 total/correct/rate', () => {
    const logs = [
      log('2026-07-20', '言语', 20, 16),
      log('2026-07-25', '言语', 10, 9),
      log('2026-07-28', '数量', 10, 5)
    ]
    const mp = new Map(moduleProgress(logs, 30, NOW).map((m) => [m.module, m]))
    expect(mp.get('言语')).toMatchObject({ total: 30, correct: 25, rate: 25 / 30 })
    expect(mp.get('数量')).toMatchObject({ total: 10, correct: 5, rate: 0.5 })
    expect(mp.get('判断')!.total).toBe(0)
    expect(mp.get('判断')!.rate).toBe(0) // 无数据 → 0，不报错
  })

  it('窗口外不计入', () => {
    const logs = [
      log('2026-06-01', '言语', 100, 100), // 30+ 天前，排除
      log('2026-07-29', '言语', 20, 10)
    ]
    const mp = moduleProgress(logs, 30, NOW)
    expect(mp.find((m) => m.module === '言语')!.total).toBe(20)
  })
})

describe('dailyTrend（§7.4 趋势，边界：无记录/全对）', () => {
  it('14 天序列长度 14，无记录日期补 0', () => {
    const t = dailyTrend([], 14, NOW)
    expect(t).toHaveLength(14)
    expect(t.every((d) => d.rate === 0 && d.total === 0)).toBe(true)
    expect(t[13].date).toBe('2026-07-29') // 最后一天=今天
  })
  it('某天有记录算聚合正确率，全对 → 1', () => {
    const logs = [
      log('2026-07-29', '言语', 10, 10), // 全对
      log('2026-07-29', '数量', 10, 6) // 当天聚合 16/20
    ]
    const t = dailyTrend(logs, 1, NOW)
    expect(t[0].rate).toBe(16 / 20)
    const allCorrect = dailyTrend([log('2026-07-29', '言语', 10, 10)], 1, NOW)
    expect(allCorrect[0].rate).toBe(1)
  })
})

describe('weakPoints（§7.4 薄弱点）', () => {
  it('有 weakPoints → 词频 Top', () => {
    const logs = [
      log('2026-07-28', '数量', 10, 5, ['排列组合', '排列组合', '概率']),
      log('2026-07-29', '言语', 10, 6, ['逻辑填空'])
    ]
    const wp = weakPoints(logs, 30, 5, NOW)
    expect(wp[0]).toMatchObject({ name: '排列组合', count: 2, isModule: false })
  })
  it('无细粒度 → 模块正确率垫底（仅取有数据）', () => {
    const logs = [
      log('2026-07-28', '数量', 10, 5), // 50%
      log('2026-07-28', '言语', 10, 9) // 90%
    ]
    const wp = weakPoints(logs, 30, 5, NOW)
    expect(wp[0]).toMatchObject({ name: '数量', isModule: true })
    expect((wp[0].rate! * 100).toFixed(0)).toBe('50')
  })
  it('完全无数据 → 空', () => {
    expect(weakPoints([], 30, 5, NOW)).toEqual([])
  })
})

describe('weeklyVolume（环比）', () => {
  it('本周/上周题量与环比', () => {
    const logs = [
      log('2026-07-29', '言语', 20, 15), // 本周（近7天含今天）
      log('2026-07-25', '言语', 30, 20), // 本周
      log('2026-07-20', '言语', 40, 30), // 上周（7-13天前）
      log('2026-07-10', '言语', 50, 50) // 更早，不算
    ]
    const v = weeklyVolume(logs, NOW)
    expect(v.thisWeek).toBe(50) // 20+30
    expect(v.lastWeek).toBe(40)
    expect(v.momDelta).toBe(10)
  })
})

describe('advise（正确率<65% 建议）', () => {
  it('有 <65% 板块 → 文案出现该板块', () => {
    const mp = moduleProgress(
      [log('2026-07-29', '数量', 10, 6), log('2026-07-29', '言语', 10, 9)],
      30,
      NOW
    )
    const txt = advise(mp)
    expect(txt).toContain('数量') // 60%
    expect(txt).not.toContain('言语') // 90% 达标
  })
  it('全部达标 → 保持节奏文案', () => {
    const mp = moduleProgress([log('2026-07-29', '言语', 10, 9)], 30, NOW)
    expect(advise(mp)).toContain('保持')
  })
  it('无数据 → 引导录入', () => {
    expect(advise(moduleProgress([], 30, NOW))).toContain('录入')
  })
})

describe('windowFrom', () => {
  it('30 天窗口含今天 → 起点 29 天前', () => {
    expect(windowFrom(30, NOW)).toBe('2026-06-30')
  })
})
