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

/* ---------- 错题本 ---------- */

export interface WrongEntry {
  card: Card
  state: CardState
}

/** 错题数（仅看 states，无需加载卡片）：答错过且未掌握 */
export function wrongCount(states: Iterable<CardState>): number {
  let n = 0
  for (const s of states) if (s.wrongCount > 0 && !s.mastered) n++
  return n
}

/** 错题本清单：答错过且未掌握，按错次降序、最近答题降序 */
export function wrongCards(cards: Card[], states: Map<string, CardState>): WrongEntry[] {
  const out: WrongEntry[] = []
  for (const c of cards) {
    const s = states.get(c.id)
    if (s && s.wrongCount > 0 && !s.mastered) out.push({ card: c, state: s })
  }
  return out.sort((a, b) => b.state.wrongCount - a.state.wrongCount || b.state.lastAt - a.state.lastAt)
}

/* ---------- 考点覆盖统计 ---------- */

/** 卡的模块标签：有二级考点用二级（tags[1]），否则回退一级（tags[0]） */
export function moduleTag(c: Card): string {
  return c.tags[1] ?? c.tags[0] ?? '未分类'
}

export interface CoverageRow {
  institution: string
  tag: string
  label: string
  total: number
  mastered: number
  wrong: number // 在复习队列中（答错过、未掌握）
}

/** 按机构 × 考点（二级优先）统计覆盖：总量/已掌握/复习中 */
export function coverageByTag(cards: Card[], states: Map<string, CardState>): CoverageRow[] {
  const rows = new Map<string, CoverageRow>()
  for (const c of cards) {
    const institution = c.source.institution
    const tag = moduleTag(c)
    const label = `${institution} · ${tag}`
    let row = rows.get(label)
    if (!row) {
      row = { institution, tag, label, total: 0, mastered: 0, wrong: 0 }
      rows.set(label, row)
    }
    row.total += 1
    const st = states.get(c.id)
    if (st?.mastered) row.mastered += 1
    else if (st && st.wrongCount > 0) row.wrong += 1
  }
  return [...rows.values()].sort((a, b) => b.total - a.total)
}

/** 按模块系统复习：取该机构×考点全部卡，未掌握在前、已掌握在后，按 id 稳定排序（不洗牌） */
export function moduleSession(
  cards: Card[],
  institution: string,
  tag: string,
  states: Map<string, CardState>
): Card[] {
  return cards
    .filter((c) => c.source.institution === institution && moduleTag(c) === tag)
    .sort((a, b) => {
      const ma = states.get(a.id)?.mastered ? 1 : 0
      const mb = states.get(b.id)?.mastered ? 1 : 0
      return ma - mb || a.id.localeCompare(b.id)
    })
}

/* ---------- 刷题主页：机构分类树（参考粉笔层级树 + 每节点进度） ---------- */

export interface PracticeNode {
  key: string // 全路径唯一键：机构 / 机构|一级 / 机构|一级|二级
  label: string
  total: number
  done: number // 组内有答题记录（cardState 存在）的卡数
  mastered: number // 组内 state.mastered 的卡数
  children: PracticeNode[]
  match?: (c: Card) => boolean // 仅叶子节点：筛出本组卡片
}

/** 机构固定排序，未列出的机构排最后 */
const INSTITUTION_ORDER = ['新华社', '人民日报', '总台', '时政押题']

/** 时政押题来源文档 → 月份分组标签（"1月份押题（带答案版）" → "1月"），无法解析归 "其他" */
export function shizhengMonth(doc: string): string {
  const m = /(\d{1,2})\s*月/.exec(doc)
  return m ? `${Number(m[1])}月` : '其他'
}

function leafNode(key: string, label: string, list: Card[], states: Map<string, CardState>, match: (c: Card) => boolean): PracticeNode {
  let done = 0
  let mastered = 0
  for (const c of list) {
    const s = states.get(c.id)
    if (s) {
      done += 1
      if (s.mastered) mastered += 1
    }
  }
  return { key, label, total: list.length, done, mastered, children: [], match }
}

/** 组内排序：题量降序，"其他"/"未分类" 兜底组排最后 */
function byTotalDesc(a: PracticeNode, b: PracticeNode): number {
  const tail = (n: PracticeNode) => (n.label === '其他' || n.label === '未分类' ? 1 : 0)
  return tail(a) - tail(b) || b.total - a.total || a.label.localeCompare(b.label, 'zh')
}

/** 二级节点排序权重：媒体向在前、行测类靠后（媒体常识 < 新闻实务 < 时政 < 行测* < 其他） */
function groupSortWeight(label: string): number {
  if (label === '媒体常识') return 0
  if (label === '新闻实务') return 1
  if (label === '时政') return 2
  if (label.startsWith('行测')) return 3
  return 4
}

/** 二级节点排序：先按媒体向权重，同权重内题量降序 */
function byGroupWeight(a: PracticeNode, b: PracticeNode): number {
  return groupSortWeight(a.label) - groupSortWeight(b.label) || byTotalDesc(a, b)
}

/**
 * 机构分类树：机构 → 一级标签（时政押题例外：按 source.doc 月份）→ 二级考点。
 * 二级考点仅当组内存在 ≥2 个不同 tags[1] 时展开，缺失二级标签的卡归入 "其他"；否则二级节点即叶子。
 * 二级节点排序：媒体向在前、行测类靠后（见 groupSortWeight），同权重内题量降序；三级按题量降序。
 */
export function buildPracticeTree(cards: Card[], states: Map<string, CardState>): PracticeNode[] {
  const byInst = new Map<string, Card[]>()
  for (const c of cards) {
    const ins = c.source.institution
    if (!byInst.has(ins)) byInst.set(ins, [])
    byInst.get(ins)!.push(c)
  }
  const institutions = [...byInst.keys()].sort((a, b) => {
    const ia = INSTITUTION_ORDER.indexOf(a)
    const ib = INSTITUTION_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh')
  })

  return institutions.map((ins) => {
    const list = byInst.get(ins)!
    // 二级分组键：时政押题按月份，其余按一级标签 tags[0]
    const groupOf = (c: Card) => (ins === '时政押题' ? shizhengMonth(c.source.doc) : c.tags[0] ?? '未分类')
    const byGroup = new Map<string, Card[]>()
    for (const c of list) {
      const g = groupOf(c)
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g)!.push(c)
    }
    const groups = [...byGroup.keys()].sort((a, b) =>
      ins === '时政押题' && a !== '其他' && b !== '其他'
        ? Number.parseInt(a) - Number.parseInt(b)
        : 0
    )

    const children = groups.map((g) => {
      const glist = byGroup.get(g)!
      const gkey = `${ins}|${g}`
      const matchGroup = (c: Card) => c.source.institution === ins && groupOf(c) === g
      if (ins === '时政押题') return leafNode(gkey, g, glist, states, matchGroup) // 月分组即叶子

      // 三级：≥2 个不同 tags[1] 才展开，缺失的归 "其他"
      const subs = new Set(glist.map((c) => c.tags[1]).filter((t): t is string => !!t))
      if (subs.size < 2) return leafNode(gkey, g, glist, states, matchGroup)
      const bySub = new Map<string, Card[]>()
      for (const c of glist) {
        const s = c.tags[1] ?? '其他'
        if (!bySub.has(s)) bySub.set(s, [])
        bySub.get(s)!.push(c)
      }
      const subNodes = [...bySub.keys()].map((s) =>
        leafNode(`${gkey}|${s}`, s, bySub.get(s)!, states, (c) => matchGroup(c) && (c.tags[1] ?? '其他') === s)
      ).sort(byTotalDesc)
      const node = leafNode(gkey, g, glist, states, matchGroup)
      node.match = undefined // 有子节点的不是叶子
      node.children = subNodes
      return node
    }).sort(ins === '时政押题' ? (a, b) => groups.indexOf(a.label) - groups.indexOf(b.label) : byGroupWeight)

    const node = leafNode(ins, ins, list, states, () => false)
    node.match = undefined
    node.children = children
    return node
  })
}

/** 叶子节点刷题队列：该组全部卡，未掌握在前、按 id 稳定排序（与 moduleSession 同策略） */
export function nodeSession(cards: Card[], node: PracticeNode, states: Map<string, CardState>): Card[] {
  if (!node.match) return []
  return cards.filter(node.match).sort((a, b) => {
    const ma = states.get(a.id)?.mastered ? 1 : 0
    const mb = states.get(b.id)?.mastered ? 1 : 0
    return ma - mb || a.id.localeCompare(b.id)
  })
}
