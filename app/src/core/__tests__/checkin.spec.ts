import { describe, it, expect } from 'vitest'
import { dayStat, isAllDone, heatLevel, nextStreak, buildCheckin } from '../checkin'
import type { Checkin, Task } from '@/db'

function task(subject: Task['subject'], status: Task['status']): Task {
  return { date: '2026-07-29', subject, title: 't', status }
}

describe('dayStat', () => {
  it('counts done/total and rate', () => {
    const tasks = [task('xc', 'done'), task('sl', 'todo'), task('sw', 'done')]
    expect(dayStat(tasks)).toEqual({ doneCount: 2, totalCount: 3, rate: 2 / 3 })
  })
  it('empty list → rate 0 (avoid divide by zero)', () => {
    expect(dayStat([])).toEqual({ doneCount: 0, totalCount: 0, rate: 0 })
  })
})

describe('isAllDone', () => {
  it('true only when all done and list non-empty', () => {
    expect(isAllDone([task('xc', 'done'), task('sl', 'done')])).toBe(true)
    expect(isAllDone([task('xc', 'done'), task('sl', 'todo')])).toBe(false)
    expect(isAllDone([])).toBe(false)
  })
})

describe('heatLevel (§7.2 档位)', () => {
  it('100% → l4', () => expect(heatLevel(1)).toBe(4))
  it('≥75% → l3', () => expect(heatLevel(0.75)).toBe(3))
  it('≥40% → l2', () => expect(heatLevel(0.4)).toBe(2))
  it('>0% → l1', () => expect(heatLevel(0.1)).toBe(1))
  it('0 → l0', () => expect(heatLevel(0)).toBe(0))
  it('边界：0.74 → l2', () => expect(heatLevel(0.74)).toBe(2))
})

describe('nextStreak (跨天 streak 中断与续接)', () => {
  it('昨天无记录 → 1（新开始）', () => {
    expect(nextStreak(undefined)).toBe(1)
  })
  it('昨天有记录 → 昨天 streak + 1（续接）', () => {
    const yesterday: Checkin = { date: '2026-07-28', doneCount: 6, totalCount: 6, streak: 5 }
    expect(nextStreak(yesterday)).toBe(6)
  })

  it('连续多天打卡，streak 递增', () => {
    // 模拟：第1天无昨天 → streak1；第2天昨天=streak1 → streak2；第3天昨天=streak2 → streak3
    const s1 = nextStreak(undefined)
    const s2 = nextStreak({ date: 'd1', doneCount: 6, totalCount: 6, streak: s1 })
    const s3 = nextStreak({ date: 'd2', doneCount: 6, totalCount: 6, streak: s2 })
    expect([s1, s2, s3]).toEqual([1, 2, 3])
  })

  it('中断一天后重新开始 → 重置为 1', () => {
    // 第1天 streak3；第2天没打卡（无 checkin 记录）；第3天昨天无记录 → 重置 1
    const day1: Checkin = { date: 'd1', doneCount: 6, totalCount: 6, streak: 3 }
    // 第2天跳过（未打卡），第3天：
    const day3Streak = nextStreak(undefined) // 第2天无 checkin
    expect(day3Streak).toBe(1)
    void day1
  })
})

describe('buildCheckin', () => {
  it('聚合统计 + streak', () => {
    const tasks = [task('xc', 'done'), task('sl', 'done')]
    const yesterday: Checkin = { date: '2026-07-28', doneCount: 2, totalCount: 2, streak: 4 }
    const c = buildCheckin('2026-07-29', tasks, yesterday)
    expect(c).toMatchObject({ date: '2026-07-29', doneCount: 2, totalCount: 2, streak: 5 })
  })
})
