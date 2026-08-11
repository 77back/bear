/**
 * MiniTable 存储适配层测试。
 * mock uni.storage（内存 Map 模拟），覆盖：
 * 增删改查 / where 查询 / 自增 id / 主键表 put 覆盖 / 防抖持久化。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---- uni API mock：内存 storage ----
const memStorage = new Map<string, string>()

vi.stubGlobal('uni', {
  getStorageSync: (key: string) => memStorage.get(key) ?? '',
  setStorageSync: (key: string, value: string) => void memStorage.set(key, value),
  removeStorageSync: (key: string) => void memStorage.delete(key)
})

// stub 之后再导入被测模块（模块内仅在使用时调用 uni.*，无顶层副作用）
const { db, todayStr } = await import('@/db')

describe('MiniTable 存储适配层', () => {
  beforeEach(async () => {
    memStorage.clear()
    // 注意：MiniTable 有 loaded 缓存，跨用例通过清表保持隔离
    await db.cardAttempts.clear()
    await db.cardStates.clear()
    await db.tasks.clear()
    await db.checkins.clear()
    await db.settings.clear()
  })

  it('自增 id 表：add 生成递增 id，toArray 全量返回', async () => {
    const id1 = await db.cardAttempts.add({ cardId: 'a-1', date: '2026-08-11', mode: 'casual', correct: true, at: 1 })
    const id2 = await db.cardAttempts.add({ cardId: 'a-2', date: '2026-08-11', mode: 'casual', correct: false, at: 2 })
    expect(id1).toBe(1)
    expect(id2).toBe(2)
    expect(await db.cardAttempts.count()).toBe(2)
    const all = await db.cardAttempts.toArray()
    expect(all.map((a) => a.cardId)).toEqual(['a-1', 'a-2'])
  })

  it('主键表：put 同键覆盖而非追加', async () => {
    await db.cardStates.put({ cardId: 'a-1', seen: 1, correctCount: 1, wrongCount: 0, streak: 1, mastered: false, lastAt: 1 })
    await db.cardStates.put({ cardId: 'a-1', seen: 2, correctCount: 2, wrongCount: 0, streak: 2, mastered: true, lastAt: 2 })
    expect(await db.cardStates.count()).toBe(1)
    const st = await db.cardStates.get('a-1')
    expect(st!.seen).toBe(2)
    expect(st!.mastered).toBe(true)
  })

  it('where().equals() / startsWith() 查询', async () => {
    await db.tasks.bulkAdd([
      { date: '2026-08-11', subject: 'xc', title: 't1', status: 'todo' },
      { date: '2026-08-11', subject: 'sw', title: 't2', status: 'done' },
      { date: '2026-08-12', subject: 'xc', title: 't3', status: 'todo' }
    ])
    const day11 = await db.tasks.where('date').equals('2026-08-11').toArray()
    expect(day11.length).toBe(2)
    const month = await db.tasks.where('date').startsWith('2026-08').toArray()
    expect(month.length).toBe(3)
    const empty = await db.tasks.where('date').startsWith('2026-09').toArray()
    expect(empty.length).toBe(0)
  })

  it('update / delete / get', async () => {
    const id = await db.tasks.add({ date: '2026-08-11', subject: 'xc', title: 't1', status: 'todo' })
    await db.tasks.update(id, { status: 'done', doneAt: 123 })
    const t = await db.tasks.get(id)
    expect(t!.status).toBe('done')
    expect(t!.doneAt).toBe(123)
    await db.tasks.delete(id)
    expect(await db.tasks.get(id)).toBeUndefined()
    expect(await db.tasks.count()).toBe(0)
  })

  it('checkins（字符串主键）：put/get/delete', async () => {
    await db.checkins.put({ date: '2026-08-11', doneCount: 3, totalCount: 3, streak: 5 })
    expect((await db.checkins.get('2026-08-11'))!.streak).toBe(5)
    await db.checkins.delete('2026-08-11')
    expect(await db.checkins.get('2026-08-11')).toBeUndefined()
  })

  it('防抖持久化：写入后经 flush 落到 storage', async () => {
    vi.useFakeTimers()
    try {
      await db.settings.put({ key: 'examDate', value: '2026-11-27' })
      // 防抖窗口内未落盘
      expect(memStorage.get('bear:settings')).toBeUndefined()
      vi.advanceTimersByTime(400)
      const raw = memStorage.get('bear:settings')
      expect(raw).toBeTruthy()
      const rows = JSON.parse(raw!) as { key: string; value: unknown }[]
      expect(rows).toEqual([{ key: 'examDate', value: '2026-11-27' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('orderBy().last() 返回最大键记录', async () => {
    await db.cardAttempts.add({ cardId: 'a-1', date: todayStr(), mode: 'casual', correct: true, at: 1 })
    await db.cardAttempts.add({ cardId: 'a-2', date: todayStr(), mode: 'casual', correct: true, at: 2 })
    const last = await db.cardAttempts.orderBy('id').last()
    expect(last!.cardId).toBe('a-2')
  })

  it('transaction 签名兼容：直接执行回调', async () => {
    await db.transaction('rw', db.cardAttempts, db.cardStates, async () => {
      await db.cardAttempts.add({ cardId: 'a-9', date: todayStr(), mode: 'review', correct: true, at: 3 })
      await db.cardStates.put({ cardId: 'a-9', seen: 1, correctCount: 1, wrongCount: 0, streak: 1, mastered: false, lastAt: 3 })
    })
    expect(await db.cardAttempts.count()).toBe(1)
    expect((await db.cardStates.get('a-9'))!.seen).toBe(1)
  })
})
