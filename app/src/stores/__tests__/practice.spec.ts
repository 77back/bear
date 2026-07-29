import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePracticeStore } from '../practice'
import { db } from '@/db'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('practice store（阶段5 集成）', () => {
  it('record 写入 practiceLogs，counts 更新', async () => {
    const p = usePracticeStore()
    await p.load()
    await p.record({ qtype: '消息', content: '一篇消息' })
    await p.record({ qtype: '消息', content: '另一篇' })
    expect((await db.practiceLogs.toArray()).length).toBe(2)
    expect(p.counts['消息']).toBe(2)
    expect(p.total14).toBe(2)
  })

  it('连续练习 4 种题型后，未练的「消息」被推荐加推', async () => {
    const p = usePracticeStore()
    await p.load()
    for (const q of ['评论', '策划', '标题', '纠错'] as const) {
      await p.record({ qtype: q, content: 'x' })
    }
    expect(p.recommendQtype).toBe('消息') // 唯一未练
  })

  it('全部未练 → 推荐首个（消息）', async () => {
    const p = usePracticeStore()
    await p.load()
    expect(p.recommendQtype).toBe('消息')
  })
})
