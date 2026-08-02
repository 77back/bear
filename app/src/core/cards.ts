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

/* ---------- SRS 复习调度（系统化学习，考点地图与命题库设计.md §六） ---------- */

/** 复习成功后的下一间隔（天）：stage 1→3 天、2→7 天、3→15 天、4 → 掌握毕业 */
export const SRS_INTERVALS = [3, 7, 15] as const
export const SRS_GRADUATE = 4 // 成功复习 4 次视为掌握

/** 答题结果：correct=答对；vague=自评模糊（不重置进度，明天再来）；wrong=答错/不会（重置） */
export type CardOutcome = 'correct' | 'vague' | 'wrong'

/** 'YYYY-MM-DD' + n 天 */
export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/**
 * 累计掌握状态 + SRS 调度。
 * correct：streak+1；若在复习循环中（有 dueDate）则 srsStage+1，间隔 [3,7,15] 递进，4 次毕业。
 * vague：不计答对、streak 清零，但 SRS 进度不重置，明天到期。
 * wrong：streak 清零、撤销掌握，SRS 重置为 stage 0，明天到期。
 * streak ≥2 同样判掌握并出队。
 */
export function applyResult(
  prev: CardState | undefined,
  cardId: string,
  outcome: CardOutcome,
  at: number,
  today: string
): CardState {
  const s: CardState = prev ?? { cardId, seen: 0, correctCount: 0, wrongCount: 0, streak: 0, mastered: false, lastAt: 0 }
  s.seen += 1
  if (outcome === 'correct') {
    s.correctCount += 1
    s.streak += 1
    if (s.dueDate) {
      const stage = (s.srsStage ?? 0) + 1
      s.srsStage = stage
      s.dueDate = stage >= SRS_GRADUATE ? undefined : addDaysStr(today, SRS_INTERVALS[stage - 1])
    }
    // 掌握判定：复习循环外靠 streak≥2；循环内必须走完 4 阶段（否则复习两次就提前毕业）
    if ((s.srsStage === undefined && s.streak >= 2) || (s.srsStage ?? 0) >= SRS_GRADUATE) {
      s.mastered = true
      s.dueDate = undefined
    }
  } else if (outcome === 'vague') {
    s.wrongCount += 1
    s.streak = 0
    s.mastered = false
    if (s.srsStage === undefined) s.srsStage = 0
    s.dueDate = addDaysStr(today, 1)
  } else {
    s.wrongCount += 1
    s.streak = 0
    s.mastered = false
    s.srsStage = 0
    s.dueDate = addDaysStr(today, 1)
  }
  s.lastAt = at
  return s
}

/** 今日到期的复习卡 id：dueDate ≤ today 且未掌握，按到期日升序 */
export function dueCardIds(states: Iterable<CardState>, today: string): string[] {
  return [...states]
    .filter((s) => !s.mastered && s.dueDate && s.dueDate <= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((s) => s.cardId)
}

/** 系统化复习队列：按到期顺序取卡（未掌握的错题优先，无需洗牌） */
export function buildReviewQueue(cards: Card[], states: Iterable<CardState>, today: string): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return dueCardIds(states, today)
    .map((id) => byId.get(id))
    .filter((c): c is Card => !!c)
}

/* ---------- 考点覆盖统计 ---------- */

export interface CoverageRow {
  label: string
  total: number
  mastered: number
  wrong: number // 在复习队列中（答错过、未掌握）
}

/** 按机构 × 主标签（tags[0]）统计覆盖：总量/已掌握/复习中 */
export function coverageByTag(cards: Card[], states: Map<string, CardState>): CoverageRow[] {
  const rows = new Map<string, CoverageRow>()
  for (const c of cards) {
    const label = `${c.source.institution} · ${c.tags[0] ?? '未分类'}`
    let row = rows.get(label)
    if (!row) {
      row = { label, total: 0, mastered: 0, wrong: 0 }
      rows.set(label, row)
    }
    row.total += 1
    const st = states.get(c.id)
    if (st?.mastered) row.mastered += 1
    else if (st && st.wrongCount > 0) row.wrong += 1
  }
  return [...rows.values()].sort((a, b) => b.total - a.total)
}
