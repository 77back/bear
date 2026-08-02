import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCardsStore, type Card } from '../cards'
import { db } from '@/db'

const CARD: Card = {
  id: 'xs-001',
  kind: 'single',
  stem: '新华社成立于哪一年？',
  options: { A: '1931', B: '1937', C: '1949', D: '1950' },
  answer: 'A',
  analysis: '红中社 1931',
  tags: ['媒体常识'],
  source: { institution: '新华社', doc: '题库1', reliability: '机构题库' }
}

const INDEX = [{ key: 'xs', institution: '新华社', doc: '题库1', count: 1, reliability: '机构题库', tags: ['媒体常识'] }]

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}
function notFound() {
  return { ok: false, status: 404, json: async () => ({}) }
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('cards store 数据加载', () => {
  it('loadIndex 正常读取；404 降级为空数组', async () => {
    globalThis.fetch = (async () => ok(INDEX)) as unknown as typeof fetch
    const s = useCardsStore()
    await s.loadIndex()
    expect(s.index).toHaveLength(1)

    globalThis.fetch = (async () => notFound()) as unknown as typeof fetch
    const s2 = useCardsStore()
    await s2.loadIndex()
    expect(s2.index).toEqual([])
  })

  it('loadDeck 读卡片且走缓存（第二次不再 fetch）', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return ok([CARD])
    }) as unknown as typeof fetch
    const s = useCardsStore()
    const a = await s.loadDeck('xs')
    const b = await s.loadDeck('xs')
    expect(a).toHaveLength(1)
    expect(b).toStrictEqual(a) // 响应式 Proxy 包裹，身份不等但内容一致
    expect(calls).toBe(1)
  })

  it('loadDeck 404 降级为空数组', async () => {
    globalThis.fetch = (async () => notFound()) as unknown as typeof fetch
    const s = useCardsStore()
    expect(await s.loadDeck('ghost')).toEqual([])
  })
})

describe('cards store 答题记录', () => {
  it('recordAttempt 写入 attempt 与 state，缓存同步', async () => {
    const s = useCardsStore()
    await s.recordAttempt(CARD, 'casual', true)
    await s.recordAttempt(CARD, 'casual', true)

    expect(await db.cardAttempts.count()).toBe(2)
    const st = await db.cardStates.get(CARD.id)
    expect(st).toMatchObject({ seen: 2, correctCount: 2, streak: 2, mastered: true })
    expect(s.states.get(CARD.id)?.mastered).toBe(true)

    const attempts = await db.cardAttempts.toArray()
    expect(attempts[0]).toMatchObject({ cardId: CARD.id, mode: 'casual', correct: true })
  })

  it('翻卡自评记录 selfGrade；答错撤销掌握', async () => {
    const s = useCardsStore()
    await s.recordAttempt(CARD, 'review', true)
    await s.recordAttempt(CARD, 'review', true)
    await s.recordAttempt(CARD, 'review', false, 'unknown')

    const st = await db.cardStates.get(CARD.id)
    expect(st).toMatchObject({ seen: 3, streak: 0, mastered: false })
    const last = (await db.cardAttempts.orderBy('id').last())!
    expect(last.selfGrade).toBe('unknown')
  })

  it('loadStates 从 DB 恢复缓存', async () => {
    await db.cardStates.put({ cardId: 'x', seen: 1, correctCount: 1, wrongCount: 0, streak: 1, mastered: false, lastAt: 1 })
    const s = useCardsStore()
    await s.loadStates()
    expect(s.states.get('x')?.seen).toBe(1)
  })
})
