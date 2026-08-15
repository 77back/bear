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
  wrongCards,
  shizhengMonth,
  buildPracticeTree,
  nodeSession,
  nodeSessionAll,
  type PracticeNode
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

describe('shizhengMonth 时政押题月份解析', () => {
  it('从来源文档解析月份', () => {
    expect(shizhengMonth('1月份押题（带答案版）')).toBe('1月')
    expect(shizhengMonth('12月份押题（含答案版）')).toBe('12月')
    expect(shizhengMonth('无月份文档')).toBe('其他')
  })
})

describe('buildPracticeTree 机构分类树', () => {
  const cards = [
    // 新华社 · 行测常识：2 个二级考点 + 1 张缺二级 → 展开三级
    mk({ id: 'x-1', tags: ['行测常识', '法律'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    mk({ id: 'x-2', tags: ['行测常识', '法律'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    mk({ id: 'x-3', tags: ['行测常识', '政治理论'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    mk({ id: 'x-4', tags: ['行测常识'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    // 新华社 · 媒体常识：仅 1 个二级考点 → 二级节点即叶子
    mk({ id: 'x-5', tags: ['媒体常识', '机构历史'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
    // 人民日报 · 新闻实务：无二级标签 → 叶子
    mk({ id: 'r-1', tags: ['新闻实务'], source: { institution: '人民日报', doc: 'd', reliability: 'r' } }),
    // 时政押题：按 source.doc 月份分组（二级考点存在但不展开）
    mk({ id: 'y-1', tags: ['时政', '科技成就'], source: { institution: '时政押题', doc: '1月份押题（带答案版）', reliability: 'r' } }),
    mk({ id: 'y-2', tags: ['时政', '经济金融'], source: { institution: '时政押题', doc: '1月份押题（带答案版）', reliability: 'r' } }),
    mk({ id: 'y-3', tags: ['时政', '科技成就'], source: { institution: '时政押题', doc: '2月份押题（带答案版）', reliability: 'r' } }),
    mk({ id: 'y-4', tags: ['时政'], source: { institution: '时政押题', doc: '每月时政汇总', reliability: 'r' } })
  ]
  const mkState = (cardId: string, mastered: boolean): CardState => ({
    cardId, seen: 1, correctCount: mastered ? 1 : 0, wrongCount: mastered ? 0 : 1, streak: 0, mastered, lastAt: 0
  })
  const states = new Map<string, CardState>([
    ['x-1', mkState('x-1', true)], // 做过且掌握
    ['x-2', mkState('x-2', false)], // 做过未掌握
    ['y-1', mkState('y-1', true)]
  ])
  const tree = buildPracticeTree(cards, states)

  it('一级为机构，按固定顺序排列', () => {
    expect(tree.map((n) => n.label)).toEqual(['新华社', '人民日报', '时政押题'])
    expect(tree.every((n) => !n.match && n.children.length)).toBe(true)
  })

  it('进度口径：done=有 state 的卡数，mastered=掌握的卡数，逐级汇总', () => {
    const xs = tree[0]
    expect(xs).toMatchObject({ total: 5, done: 2, mastered: 1 })
    const rm = tree[1]
    expect(rm).toMatchObject({ total: 1, done: 0, mastered: 0 })
    const yati = tree[2]
    expect(yati).toMatchObject({ total: 4, done: 1, mastered: 1 })
  })

  it('二级按一级标签分组；≥2 个不同 tags[1] 展开三级，缺失归 "其他"', () => {
    const xs = tree[0]
    const xc = xs.children.find((n) => n.label === '行测常识')!
    expect(xc).toMatchObject({ total: 4, done: 2, mastered: 1 })
    expect(xc.match).toBeUndefined() // 分组节点不是叶子
    expect(xc.children.map((n) => n.label)).toEqual(['法律', '政治理论', '其他']) // 题量降序，其他垫底
    const law = xc.children[0]
    expect(law).toMatchObject({ total: 2, done: 2, mastered: 1 })
    expect(law.match).toBeDefined() // 叶子有过滤器
    // 仅 1 个二级考点 → 二级节点即叶子
    const mt = xs.children.find((n) => n.label === '媒体常识')!
    expect(mt.children).toEqual([])
    expect(mt.match).toBeDefined()
    expect(mt).toMatchObject({ total: 1, done: 0, mastered: 0 })
  })

  it('时政押题按月分组且月份节点即叶子（不展开二级考点），无法解析归 "其他"', () => {
    const yati = tree[2]
    expect(yati.children.map((n) => n.label)).toEqual(['1月', '2月', '其他'])
    const jan = yati.children[0]
    expect(jan).toMatchObject({ total: 2, done: 1, mastered: 1 })
    expect(jan.children).toEqual([])
    expect(jan.match).toBeDefined()
  })

  it('nodeSession 叶子队列：未做过的在前，已掌握殿后', () => {
    const xc = tree[0].children.find((n) => n.label === '行测常识')!
    const law = xc.children[0]
    expect(nodeSession(cards, law, states).map((c) => c.id)).toEqual(['x-2', 'x-1']) // x-2 做过未掌握，已掌握的 x-1 殿后
    const jan = tree[2].children[0]
    expect(nodeSession(cards, jan, states).map((c) => c.id)).toEqual(['y-2', 'y-1']) // 没做过的 y-2 在已掌握的 y-1 前
    // 非叶子返回空
    expect(nodeSession(cards, xc, states)).toEqual([])
  })

  it('空题库返回空树', () => {
    expect(buildPracticeTree([], new Map())).toEqual([])
  })

  it('二级节点排序：媒体向在前、行测类靠后，同权重内题量降序', () => {
    const cards2 = [
      // 新华社：行测题量更大但排在媒体常识之后
      mk({ id: 's-1', tags: ['行测常识', '法律'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      mk({ id: 's-2', tags: ['行测常识', '法律'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      mk({ id: 's-3', tags: ['媒体常识'], source: { institution: '新华社', doc: 'd', reliability: 'r' } }),
      // 人民日报：新闻实务 < 时政 < 行测*
      mk({ id: 'p-1', tags: ['行测-言语'], source: { institution: '人民日报', doc: 'd', reliability: 'r' } }),
      mk({ id: 'p-2', tags: ['时政'], source: { institution: '人民日报', doc: 'd', reliability: 'r' } }),
      mk({ id: 'p-3', tags: ['新闻实务'], source: { institution: '人民日报', doc: 'd', reliability: 'r' } })
    ]
    const tree2 = buildPracticeTree(cards2, new Map())
    expect(tree2[0].children.map((n) => n.label)).toEqual(['媒体常识', '行测常识'])
    expect(tree2[1].children.map((n) => n.label)).toEqual(['新闻实务', '时政', '行测-言语'])
  })
})

describe('nodeSession 节点续刷 / nodeSessionAll 重刷', () => {
  const node: PracticeNode = {
    key: '新华社|媒体常识',
    label: '媒体常识',
    total: 4,
    done: 0,
    mastered: 0,
    children: [],
    match: (c) => c.source.institution === '新华社'
  }
  const cards = [mk({ id: 'n-1' }), mk({ id: 'n-2' }), mk({ id: 'n-3' }), mk({ id: 'n-4' })]
  const mkState = (cardId: string, seen: number, mastered: boolean): CardState => ({
    cardId, seen, correctCount: mastered ? 2 : 0, wrongCount: mastered ? 0 : 1, streak: 0, mastered, lastAt: 0
  })

  it('全部没做过：按 id 原顺序', () => {
    expect(nodeSession(cards, node, new Map()).map((c) => c.id)).toEqual(['n-1', 'n-2', 'n-3', 'n-4'])
  })

  it('续刷位置：做过未掌握的排在没做过的后面（上次刷到哪就从哪继续）', () => {
    const states = new Map<string, CardState>([
      ['n-1', mkState('n-1', 1, false)],
      ['n-2', mkState('n-2', 3, false)]
    ])
    expect(nodeSession(cards, node, states).map((c) => c.id)).toEqual(['n-3', 'n-4', 'n-1', 'n-2'])
  })

  it('seen===0 的记录视为没做过，已掌握的殿后', () => {
    const states = new Map<string, CardState>([
      ['n-1', mkState('n-1', 0, false)], // 有记录但没做过 → 第一段
      ['n-3', mkState('n-3', 2, true)] // 已掌握 → 殿后
    ])
    expect(nodeSession(cards, node, states).map((c) => c.id)).toEqual(['n-1', 'n-2', 'n-4', 'n-3'])
  })

  it('nodeSessionAll 不看状态，全部卡按 id 原序（重刷本组用）', () => {
    expect(nodeSessionAll(cards, node).map((c) => c.id)).toEqual(['n-1', 'n-2', 'n-3', 'n-4'])
  })

  it('非叶子节点两者都返回空', () => {
    const group: PracticeNode = { ...node, match: undefined }
    expect(nodeSession(cards, group, new Map())).toEqual([])
    expect(nodeSessionAll(cards, group)).toEqual([])
  })
})
