import type {
  ArchiveCase,
  CaseItem,
  KnowledgeItem,
  MediaKnowledgeItem,
  MediaOrg,
  MediaPlan,
  MediaReport,
  PinglunEntry,
  ShizhengMonth
} from '@/stores/content'

/**
 * 案例库 / 评论库检索（纯函数，构建框架外的新增工具）。
 * 三条件交集：关键词（不区分大小写）+ 领域 + 月份；结果按日期新→旧。
 */

/** 关键词包含匹配：空关键词恒真；任一字段命中即算匹配 */
export function kwMatch(keyword: string, fields: (string | undefined)[]): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(kw))
}

/** 从 date(YYYY-MM-DD) 提取实际存在的月份 YYYY-MM，新→旧 */
export function monthsOf(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean).map((d) => d.slice(0, 7)))].sort().reverse()
}

/** examUse 兼容字符串/数组两种形态（与 ShiwuView.fmtExamUse 一致） */
function examUseText(v: PinglunEntry['examUse']): string {
  return Array.isArray(v) ? v.join('；') : v || ''
}

export interface CaseFilter {
  keyword?: string
  domain?: string // '全部' 或空 = 不限
  month?: string // 空 = 不限
}

/** 案例库筛选：title/text/source 关键词 + 领域 + 月份交集，按 date 新→旧 */
export function filterCases(cases: ArchiveCase[], f: CaseFilter): ArchiveCase[] {
  return cases
    .filter((c) => {
      if (f.domain && f.domain !== '全部' && c.domain !== f.domain) return false
      if (f.month && c.date.slice(0, 7) !== f.month) return false
      return kwMatch(f.keyword ?? '', [c.title, c.text, c.source])
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export interface PinglunFilter {
  keyword?: string
  month?: string
  domain?: string // '全部领域' 或空 = 不限
}

/** 评论库筛选：title/structure/examUse/source 关键词 + 月份 + 领域交集 */
export function filterPinglun(list: PinglunEntry[], f: PinglunFilter): PinglunEntry[] {
  return list.filter((p) => {
    if (f.month && p.month !== f.month) return false
    if (f.domain && f.domain !== '全部领域' && !(p.domains || []).includes(f.domain)) return false
    return kwMatch(f.keyword ?? '', [p.title, p.structure, examUseText(p.examUse), p.source])
  })
}

/** 时政库筛选：关键词命中 title/domains/analysis/reading/source 任一；保留月份分区，空分区剔除 */
export function filterShizheng(months: ShizhengMonth[], keyword: string): ShizhengMonth[] {
  return months
    .map((m) => ({
      month: m.month,
      items: m.items.filter((it) =>
        kwMatch(keyword, [it.title, ...(it.domains || []), it.analysis, it.reading, it.source])
      )
    }))
    .filter((m) => m.items.length > 0)
}

/** 当年第几天（1 起算） */
export function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00`)
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1
}

/**
 * 每日纠错知识点轮换：按当年第几天对题库长度取模（确定性，同一天结果不变）。
 * 返回 1 起的序号 + 条目；题库为空返回 null。
 */
export function pickDailyKnowledge(
  list: KnowledgeItem[],
  date: string
): { index: number; item: KnowledgeItem } | null {
  if (!list.length) return null
  const index = (dayOfYear(date) - 1) % list.length
  return { index: index + 1, item: list[index] }
}

/** 日期字符串 → 非负整数 hash（简单确定性：同一天结果不变，换一天换一批） */
export function hashDate(date: string): number {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) >>> 0
  return h
}

/**
 * 空包兜底：按日期确定性从案例库选 count 条（起始位置 = (hash(date)+offset) % length，环绕取条）。
 * offset 由「换一批」步进累加，同一天刷新结果不变。
 */
export function fallbackCases(
  archive: ArchiveCase[],
  date: string,
  offset = 0,
  count = 5
): ArchiveCase[] {
  if (!archive.length) return []
  const start = (hashDate(date) + offset) % archive.length
  const out: ArchiveCase[] = []
  for (let i = 0; i < Math.min(count, archive.length); i++) {
    out.push(archive[(start + i) % archive.length])
  }
  return out
}

/** 每日案例推荐结果：当日包有 cases 用当日包，否则走案例库兜底 */
export type CaseRec =
  | { mode: 'daily'; items: CaseItem[] }
  | { mode: 'archive'; items: ArchiveCase[] }

export function pickCaseRec(
  daily: CaseItem[] | null | undefined,
  archive: ArchiveCase[],
  date: string,
  offset = 0,
  count = 5
): CaseRec {
  if (daily && daily.length) return { mode: 'daily', items: daily }
  return { mode: 'archive', items: fallbackCases(archive, date, offset, count) }
}

/* ---------- 媒体备考板块筛选（纯只读，跨分区关键词搜索） ---------- */

/** 机构常识：关键词命中 org/point/detail/tag + 机构筛选（'全部' 或空 = 不限） */
export function filterMediaOrgs(
  orgs: MediaOrg[],
  f: { keyword?: string; org?: string }
): MediaOrg[] {
  return orgs.filter((o) => {
    if (f.org && f.org !== '全部' && o.org !== f.org) return false
    return kwMatch(f.keyword ?? '', [o.org, o.point, o.detail, o.tag])
  })
}

/** 媒体常识：关键词命中 question/answer/domain/tag */
export function filterMediaKnowledge(list: MediaKnowledgeItem[], keyword: string): MediaKnowledgeItem[] {
  return list.filter((k) => kwMatch(keyword, [k.question, k.answer, k.domain, k.tag]))
}

/** 策划案例：关键词命中 type/topic/title/points/note + 类型筛选（'全部' 或空 = 不限） */
export function filterMediaPlans(
  plans: MediaPlan[],
  f: { keyword?: string; type?: string }
): MediaPlan[] {
  return plans.filter((p) => {
    if (f.type && f.type !== '全部' && p.type !== f.type) return false
    return kwMatch(f.keyword ?? '', [p.type, p.topic, p.title, ...(p.points || []), p.note])
  })
}

/** 调研报告：关键词命中 title/outline/tips */
export function filterMediaReports(reports: MediaReport[], keyword: string): MediaReport[] {
  return reports.filter((r) => kwMatch(keyword, [r.title, ...(r.outline || []), r.tips]))
}
