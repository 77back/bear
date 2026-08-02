import { describe, it, expect } from 'vitest'
import {
  gradeChoice,
  gradeJudge,
  judgeTruth,
  selfGradeCorrect,
  isDirectAnswer,
  shuffle,
  filterCards,
  buildSession,
  applyResult,
  dueCardIds,
  buildReviewQueue,
  coverageByTag,
  moduleSession,
  wrongCount,
  wrongCards
} from '../cards'
import type { Card } from '@/stores/cards'
import type { CardState } from '@/db'

function mk(partial: Partial<Card>): Card {
  return {
    id: 'c-1',
    kind: 'single',
    stem: '题干',
    answer: 'A',
    analysis: '',
    tags: [],
    source: { institution: '新华社', doc: 'd', reliability: '真题合集' },
    ...partial
  }
}

describe('gradeChoice 选择题判分', () => {
  const single = mk({ answer: 'C' })
  const multi = mk({ kind: 'multi', answer: 'ABD' })

  it('单选：选对/选错', () => {
    expect(gradeChoice(single, ['C'])).toBe(true)
    expect(gradeChoice(single, ['A'])).toBe(false)
  })
  it('多选：集合完全一致才算对，与顺序无关', () => {
    expect(gradeChoice(multi, ['D', 'B', 'A'])).toBe(true)
    expect(gradeChoice(multi, ['A', 'B'])).toBe(false) // 漏选
    expect(gradeChoice(multi, ['A', 'B', 'C', 'D'])).toBe(false) // 多选
  })
  it('容忍答案带非字母字符与小写', () => {
    expect(gradeChoice(mk({ answer: 'c' }), ['C'])).toBe(true)
    expect(gradeChoice(mk({ answer: 'A、B' }), ['B', 'A'])).toBe(true)
  })
  it('答案为空不算对', () => {
    expect(gradeChoice(mk({ answer: '' }), ['A'])).toBe(false)
  })
})

describe('judgeTruth / gradeJudge 判断题', () => {
  it('答案归一', () => {
    expect(judgeTruth('对')).toBe(true)
    expect(judgeTruth('正确')).toBe(true)
    expect(judgeTruth('√')).toBe(true)
    expect(judgeTruth('错')).toBe(false)
    expect(judgeTruth('错误')).toBe(false)
    expect(judgeTruth('×')).toBe(false)
    expect(judgeTruth('可能是')).toBe(null)
  })
  it('判分', () => {
    const t = mk({ kind: 'judge', answer: '对' })
    expect(gradeJudge(t, true)).toBe(true)
    expect(gradeJudge(t, false)).toBe(false)
  })
})

describe('selfGradeCorrect / isDirectAnswer', () => {
  it('自评折算：会=对，模糊/不会=错', () => {
    expect(selfGradeCorrect('know')).toBe(true)
    expect(selfGradeCorrect('vague')).toBe(false)
    expect(selfGradeCorrect('unknown')).toBe(false)
  })
  it('选择/判断直答，填空/改错/问答翻面', () => {
    expect(isDirectAnswer(mk({ kind: 'single' }))).toBe(true)
    expect(isDirectAnswer(mk({ kind: 'multi' }))).toBe(true)
    expect(isDirectAnswer(mk({ kind: 'judge' }))).toBe(true)
    expect(isDirectAnswer(mk({ kind: 'fill' }))).toBe(false)
    expect(isDirectAnswer(mk({ kind: 'correct' }))).toBe(false)
    expect(isDirectAnswer(mk({ kind: 'qa' }))).toBe(false)
  })
})

describe('shuffle / filterCards / buildSession', () => {
  const cards = [
    mk({ id: 'a', source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    mk({ id: 'b', kind: 'fill', source: { institution: '总台', doc: 'd', reliability: 'r' } }),
    mk({ id: 'c', source: { institution: '总台', doc: 'd', reliability: 'r' } })
  ]

  it('shuffle 不改原数组，长度不变（注入 rng 确定性）', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input, () => 0.5)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect(out).toHaveLength(5)
    expect([...out].sort()).toEqual(input)
  })

  it('filterCards 按机构与题型交集', () => {
    expect(filterCards(cards, { institution: '总台' }).map((c) => c.id)).toEqual(['b', 'c'])
    expect(filterCards(cards, { kind: 'fill' }).map((c) => c.id)).toEqual(['b'])
    expect(filterCards(cards, { institution: '全部' })).toHaveLength(3)
    expect(filterCards(cards, {})).toHaveLength(3)
  })

  it('buildSession 返回洗牌后的筛选结果', () => {
    const s = buildSession(cards, { institution: '总台' }, () => 0.5)
    expect(s.map((c) => c.id).sort()).toEqual(['b', 'c'])
  })
})

describe('applyResult 掌握状态累计', () => {
  it('首次答对：streak=1，未掌握、不进复习队列', () => {
    const s = applyResult(undefined, 'c1', 'correct', 100, '2026-08-01')
    expect(s).toMatchObject({ cardId: 'c1', seen: 1, correctCount: 1, streak: 1, mastered: false, lastAt: 100 })
    expect(s.dueDate).toBeUndefined()
  })
  it('连续两次答对 → 掌握', () => {
    const s1 = applyResult(undefined, 'c1', 'correct', 100, '2026-08-01')
    const s2 = applyResult(s1, 'c1', 'correct', 200, '2026-08-01')
    expect(s2.streak).toBe(2)
    expect(s2.mastered).toBe(true)
  })
  it('答错清零 streak、撤销掌握并进复习队列（明天到期）', () => {
    const s1 = applyResult(undefined, 'c1', 'correct', 100, '2026-08-01')
    const s2 = applyResult(s1, 'c1', 'correct', 200, '2026-08-01')
    const s3 = applyResult(s2, 'c1', 'wrong', 300, '2026-08-02')
    expect(s3).toMatchObject({ streak: 0, mastered: false, wrongCount: 1, seen: 3, srsStage: 0, dueDate: '2026-08-03' })
  })
})

describe('SRS 复习调度', () => {
  it('复习答对按 3/7/15 天递进，4 次毕业掌握', () => {
    let s = applyResult(undefined, 'c1', 'wrong', 100, '2026-08-01')
    expect(s).toMatchObject({ srsStage: 0, dueDate: '2026-08-02' })

    s = applyResult(s, 'c1', 'correct', 200, '2026-08-02')
    expect(s).toMatchObject({ srsStage: 1, dueDate: '2026-08-05', mastered: false }) // +3 天

    s = applyResult(s, 'c1', 'correct', 300, '2026-08-05')
    expect(s).toMatchObject({ srsStage: 2, dueDate: '2026-08-12' }) // +7 天

    s = applyResult(s, 'c1', 'correct', 400, '2026-08-12')
    expect(s).toMatchObject({ srsStage: 3, dueDate: '2026-08-27' }) // +15 天

    s = applyResult(s, 'c1', 'correct', 500, '2026-08-27')
    expect(s.mastered).toBe(true) // 4 次毕业
    expect(s.dueDate).toBeUndefined()
  })

  it('vague 自评：进度不重置，明天再来', () => {
    let s = applyResult(undefined, 'c1', 'wrong', 100, '2026-08-01')
    s = applyResult(s, 'c1', 'correct', 200, '2026-08-02') // stage 1
    s = applyResult(s, 'c1', 'vague', 300, '2026-08-05')
    expect(s).toMatchObject({ srsStage: 1, dueDate: '2026-08-06', mastered: false, streak: 0 })
  })

  it('复习中再答错：重置回 stage 0', () => {
    let s = applyResult(undefined, 'c1', 'wrong', 100, '2026-08-01')
    s = applyResult(s, 'c1', 'correct', 200, '2026-08-02')
    s = applyResult(s, 'c1', 'wrong', 300, '2026-08-05')
    expect(s).toMatchObject({ srsStage: 0, dueDate: '2026-08-06', mastered: false })
  })
})

describe('dueCardIds / buildReviewQueue', () => {
  const mkState = (cardId: string, dueDate: string | undefined, mastered = false): CardState => ({
    cardId, seen: 1, correctCount: 0, wrongCount: 1, streak: 0, mastered, lastAt: 0, srsStage: 0, dueDate
  })

  it('到期未掌握的进入队列，按到期日升序', () => {
    const states = [
      mkState('a', '2026-08-02'),
      mkState('b', '2026-08-01'),
      mkState('c', '2026-08-10'), // 未到期
      mkState('d', undefined),
      mkState('e', '2026-08-01', true) // 已掌握
    ]
    expect(dueCardIds(states, '2026-08-02')).toEqual(['b', 'a'])
  })

  it('buildReviewQueue 映射回卡片并过滤缺失卡', () => {
    const cards = [mk({ id: 'a' }), mk({ id: 'b' })]
    const states = [mkState('a', '2026-08-01'), mkState('ghost', '2026-08-01')]
    const q = buildReviewQueue(cards, states, '2026-08-02')
    expect(q.map((c) => c.id)).toEqual(['a'])
  })
})

describe('coverageByTag 考点覆盖', () => {
  it('按机构×主标签统计总量/掌握/复习中', () => {
    const cards = [
      mk({ id: 'a', tags: ['行测常识'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      mk({ id: 'b', tags: ['行测常识'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      mk({ id: 'c', tags: ['时政'], source: { institution: '时政押题', doc: 'd', reliability: 'r' } })
    ]
    const states = new Map<string, CardState>([
      ['a', { cardId: 'a', seen: 2, correctCount: 2, wrongCount: 0, streak: 2, mastered: true, lastAt: 0 }],
      ['b', { cardId: 'b', seen: 1, correctCount: 0, wrongCount: 1, streak: 0, mastered: false, lastAt: 0, dueDate: '2026-08-02' }]
    ])
    const rows = coverageByTag(cards, states)
    expect(rows).toHaveLength(2)
    const xs = rows.find((r) => r.label === '新华社 · 行测常识')!
    expect(xs).toMatchObject({ total: 2, mastered: 1, wrong: 1 })
    const sz = rows.find((r) => r.label === '时政押题 · 时政')!
    expect(sz).toMatchObject({ total: 1, mastered: 0, wrong: 0 })
  })
})

describe('moduleSession 按模块系统复习', () => {
  it('取该机构×考点全部卡，未掌握在前、按 id 稳定排序', () => {
    const cards = [
      mk({ id: 'm-3', tags: ['时政'], source: { institution: '时政押题', doc: 'd', reliability: 'r' } }),
      mk({ id: 'm-1', tags: ['时政'], source: { institution: '时政押题', doc: 'd', reliability: 'r' } }),
      mk({ id: 'm-2', tags: ['时政'], source: { institution: '时政押题', doc: 'd', reliability: 'r' } }),
      mk({ id: 'x-1', tags: ['行测常识'], source: { institution: '新华社', doc: 'd', reliability: 'r' } })
    ]
    const states = new Map<string, CardState>([
      ['m-2', { cardId: 'm-2', seen: 2, correctCount: 2, wrongCount: 0, streak: 2, mastered: true, lastAt: 0 }]
    ])
    const q = moduleSession(cards, '时政押题', '时政', states)
    expect(q.map((c) => c.id)).toEqual(['m-1', 'm-3', 'm-2']) // 已掌握的 m-2 排最后
  })
  it('模块为空返回空数组', () => {
    expect(moduleSession([mk({ id: 'a' })], '总台', '媒体常识', new Map())).toEqual([])
  })

  it('有二级标签时按二级分组（tags[1] 优先）', () => {
    const cards = [
      mk({ id: 'a', tags: ['媒体常识', '机构历史', '新华社'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      mk({ id: 'b', tags: ['媒体常识', '企业文化', '新华社'], source: { institution: '新华社', doc: 'd', reliability: 'r' } })
    ]
    const rows = coverageByTag(cards, new Map())
    expect(rows.map((r) => r.label).sort()).toEqual(['新华社 · 企业文化', '新华社 · 机构历史'])
    expect(moduleSession(cards, '新华社', '机构历史', new Map()).map((c) => c.id)).toEqual(['a'])
  })
})

describe('wrongCards / wrongCount 错题本', () => {
  const mkState = (cardId: string, wrongCount: number, mastered: boolean, lastAt = 0): CardState => ({
    cardId, seen: wrongCount + 1, correctCount: 1, wrongCount, streak: 0, mastered, lastAt
  })
  const cards = [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' }), mk({ id: 'd' })]

  it('只收答错且未掌握的，按错次降序', () => {
    const states = new Map<string, CardState>([
      ['a', mkState('a', 1, false, 100)],
      ['b', mkState('b', 3, false, 50)],
      ['c', mkState('c', 2, true)], // 已掌握 → 移出
      ['d', mkState('d', 0, false)] // 没错过
    ])
    expect(wrongCount(states.values())).toBe(2)
    const list = wrongCards(cards, states)
    expect(list.map((e) => e.card.id)).toEqual(['b', 'a'])
    // 错次相同按最近答题降序
    expect(list[0].state.wrongCount).toBe(3)
  })

  it('无错题返回空', () => {
    expect(wrongCards(cards, new Map())).toEqual([])
    expect(wrongCount(new Map().values())).toBe(0)
  })
})
