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
  applyResult
} from '../cards'
import type { Card } from '@/stores/cards'

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
  it('首次答对：streak=1，未掌握', () => {
    const s = applyResult(undefined, 'c1', true, 100)
    expect(s).toMatchObject({ cardId: 'c1', seen: 1, correctCount: 1, streak: 1, mastered: false, lastAt: 100 })
  })
  it('连续两次答对 → 掌握', () => {
    const s1 = applyResult(undefined, 'c1', true, 100)
    const s2 = applyResult(s1, 'c1', true, 200)
    expect(s2.streak).toBe(2)
    expect(s2.mastered).toBe(true)
  })
  it('答错清零 streak 并撤销掌握', () => {
    const s1 = applyResult(undefined, 'c1', true, 100)
    const s2 = applyResult(s1, 'c1', true, 200)
    const s3 = applyResult(s2, 'c1', false, 300)
    expect(s3).toMatchObject({ streak: 0, mastered: false, wrongCount: 1, seen: 3 })
  })
})
