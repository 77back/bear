import type { ArchiveCase, PinglunEntry } from '@/stores/content'

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
