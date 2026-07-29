import { describe, it, expect } from 'vitest'
import { buildMonthCalendar, weekHead } from '../calendar'

describe('weekHead', () => {
  it('周一开头', () => {
    expect(weekHead()).toEqual(['一', '二', '三', '四', '五', '六', '日'])
  })
})

describe('buildMonthCalendar', () => {
  it('2026-07：1 号是周三 → 前面 2 个占位', () => {
    const cells = buildMonthCalendar(2026, 7, new Map())
    // 7 月有 31 天；1 号周三(mondayIndex=2) → 2 占位 + 31 天 = 33，补齐到 35
    expect(cells.length % 7).toBe(0)
    expect(cells.filter((c) => c.empty).length).toBe(2 + (35 - 33)) // 2 前置 + 2 后补
    expect(cells[2].day).toBe(1)
    expect(cells[2].empty).toBe(false)
    expect(cells.at(-1)!.empty).toBe(true)
  })

  it('按完成率给出热力档位', () => {
    const rate = new Map([
      ['2026-07-02', 1], // l4
      ['2026-07-03', 0.75], // l3
      ['2026-07-04', 0.4], // l2
      ['2026-07-05', 0.1] // l1
    ])
    const cells = buildMonthCalendar(2026, 7, rate)
    const byDay = new Map(cells.filter((c) => !c.empty).map((c) => [c.day, c]))
    expect(byDay.get(2)!.level).toBe(4)
    expect(byDay.get(3)!.level).toBe(3)
    expect(byDay.get(4)!.level).toBe(2)
    expect(byDay.get(5)!.level).toBe(1)
    expect(byDay.get(6)!.level).toBe(0) // 无数据
  })

  it('网格始终是 7 的倍数', () => {
    for (let m = 1; m <= 12; m++) {
      expect(buildMonthCalendar(2026, m, new Map()).length % 7).toBe(0)
    }
  })
})
