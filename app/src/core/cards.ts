import type { Card } from '@/stores/cards'
import type { CardState, SelfGrade } from '@/db'

/**
 * 刷题卡片纯逻辑（考点地图与命题库设计.md §六）。
 * 随心练习与系统复习共用：选择题直答判分、翻卡自评折算、掌握状态累计。
 * 纯函数，不碰 DOM/Vue/Dexie。
 */

/** 选择题判分：所选字母集合与答案字母集合完全一致（单选/多选同一规则） */
export function gradeChoice(card: Card, picked: string[]): boolean {
  const norm = (s: string) => s.replace(/[^A-Z]/gi, '').toUpperCase()
  const want = norm(card.answer)
  const got = [...picked].map((p) => norm(p)).sort().join('')
  return want.length > 0 && want.split('').sort().join('') === got
}

/** 判断题答案归一：'对'/'正确'/'√'/'T' → true；'错'/'错误'/'×'/'F' → false；无法识别 → null */
export function judgeTruth(answer: string): boolean | null {
  const a = answer.trim()
  if (/^(对|正确|√|T|true)$/i.test(a)) return true
  if (/^(错|错误|×|X|F|false)$/i.test(a)) return false
  return null
}

/** 判断题判分 */
export function gradeJudge(card: Card, pick: boolean): boolean {
  return judgeTruth(card.answer) === pick
}

/** 翻卡自评折算对错：会 → 对；模糊/不会 → 错（进入错题序列） */
export function selfGradeCorrect(grade: SelfGrade): boolean {
  return grade === 'know'
}

/** 该卡是否可直答（选择/判断），其余走翻面自评 */
export function isDirectAnswer(card: Card): boolean {
  return card.kind === 'single' || card.kind === 'multi' || card.kind === 'judge'
}

/** Fisher-Yates 洗牌（rng 可注入，测试用确定性） */
export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface CardFilter {
  institution?: string // '全部' 或空 = 不限
  kind?: string // 空 = 不限
}

/** 卡片筛选：机构 + 题型交集 */
export function filterCards(cards: Card[], f: CardFilter): Card[] {
  return cards.filter((c) => {
    if (f.institution && f.institution !== '全部' && c.source.institution !== f.institution) return false
    if (f.kind && c.kind !== f.kind) return false
    return true
  })
}

/** 随心练习开局：筛选后洗牌，返回练习队列 */
export function buildSession(cards: Card[], f: CardFilter, rng?: () => number): Card[] {
  return shuffle(filterCards(cards, f), rng)
}

/** 累计掌握状态：答对 streak+1（≥2 掌握）；答错 streak 清零、撤销掌握 */
export function applyResult(prev: CardState | undefined, cardId: string, correct: boolean, at: number): CardState {
  const s: CardState = prev ?? { cardId, seen: 0, correctCount: 0, wrongCount: 0, streak: 0, mastered: false, lastAt: 0 }
  s.seen += 1
  if (correct) {
    s.correctCount += 1
    s.streak += 1
    if (s.streak >= 2) s.mastered = true
  } else {
    s.wrongCount += 1
    s.streak = 0
    s.mastered = false
  }
  s.lastAt = at
  return s
}
