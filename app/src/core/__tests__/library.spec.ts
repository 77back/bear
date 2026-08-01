import { describe, it, expect } from 'vitest'
import { kwMatch, monthsOf, filterCases, filterPinglun, filterShizheng, pickDailyKnowledge, hashDate, fallbackCases, pickCaseRec } from '@/core/library'
import type { ArchiveCase, CaseItem, KnowledgeItem, PinglunEntry, ShizhengMonth } from '@/stores/content'

const cases: ArchiveCase[] = [
  { id: '1', date: '2026-07-02', domain: '经济发展', title: '深圳前海改革', text: '制度创新案例', source: '新华社' },
  { id: '2', date: '2026-07-15', domain: '乡村振兴', title: '安吉白茶致富', text: '一片叶子富一方', source: '人民日报' },
  { id: '3', date: '2026-06-20', domain: '经济发展', title: '义乌小商品出海', text: '跨境电商实践', source: '经济日报' }
]

const pinglun: PinglunEntry[] = [
  { id: 'a', title: '把关键小事办成暖心大事', month: '2026-07', domains: ['民生'], structure: '民生连着民心', examUse: ['民生话题可用'], source: '人民日报' },
  { id: 'b', title: '算法不能算计', month: '2026-07', domains: ['科技'], structure: '技术向善', examUse: '科技伦理', source: '新华社' },
  { id: 'c', title: '博物馆热观察', month: '2026-06', domains: ['文化'], structure: '文化自信', examUse: '', source: '光明日报' }
]

describe('kwMatch', () => {
  it('空关键词恒真', () => {
    expect(kwMatch('', ['任意'])).toBe(true)
    expect(kwMatch('   ', ['任意'])).toBe(true)
    expect(kwMatch('', [undefined])).toBe(true)
  })
  it('大小写不敏感 + 前后空白裁剪', () => {
    expect(kwMatch('AI', ['大模型ai应用'])).toBe(true)
    expect(kwMatch(' ai ', ['大模型AI应用'])).toBe(true)
  })
  it('任一字段命中即匹配；全不中则否', () => {
    expect(kwMatch('新华社', ['标题', undefined, '新华社'])).toBe(true)
    expect(kwMatch('央视', ['标题', '正文'])).toBe(false)
  })
})

describe('monthsOf', () => {
  it('提取 YYYY-MM 去重并按新→旧排序', () => {
    expect(monthsOf(['2026-07-02', '2026-07-15', '2026-06-20'])).toEqual(['2026-07', '2026-06'])
  })
  it('空输入与脏数据', () => {
    expect(monthsOf([])).toEqual([])
    expect(monthsOf(['', '2026-07-01'])).toEqual(['2026-07'])
  })
})

describe('filterCases', () => {
  it('默认（无筛选）返回全部，按 date 新→旧', () => {
    const r = filterCases(cases, {})
    expect(r.map((c) => c.id)).toEqual(['2', '1', '3'])
  })
  it('关键词命中 title/text/source 任一', () => {
    expect(filterCases(cases, { keyword: '白茶' }).map((c) => c.id)).toEqual(['2'])
    expect(filterCases(cases, { keyword: '经济日报' }).map((c) => c.id)).toEqual(['3'])
    expect(filterCases(cases, { keyword: '制度' }).map((c) => c.id)).toEqual(['1'])
  })
  it('领域 + 月份 + 关键词三条件交集', () => {
    const r = filterCases(cases, { domain: '经济发展', month: '2026-07', keyword: '前海' })
    expect(r.map((c) => c.id)).toEqual(['1'])
    expect(filterCases(cases, { domain: '经济发展', month: '2026-07', keyword: '义乌' })).toEqual([])
  })
  it('"全部"领域等同不限；无结果返回空数组', () => {
    expect(filterCases(cases, { domain: '全部' })).toHaveLength(3)
    expect(filterCases(cases, { keyword: '不存在' })).toEqual([])
  })
})

describe('filterPinglun', () => {
  it('关键词命中 title/structure/examUse/source 任一', () => {
    expect(filterPinglun(pinglun, { keyword: '暖心' }).map((p) => p.id)).toEqual(['a'])
    expect(filterPinglun(pinglun, { keyword: '技术向善' }).map((p) => p.id)).toEqual(['b'])
    expect(filterPinglun(pinglun, { keyword: '光明' }).map((p) => p.id)).toEqual(['c'])
  })
  it('examUse 数组形态也可命中', () => {
    expect(filterPinglun(pinglun, { keyword: '民生话题' }).map((p) => p.id)).toEqual(['a'])
  })
  it('月份 + 领域 + 关键词交集；无结果为空', () => {
    expect(filterPinglun(pinglun, { month: '2026-07', domain: '科技', keyword: '算法' }).map((p) => p.id)).toEqual(['b'])
    expect(filterPinglun(pinglun, { month: '2026-06', domain: '科技' })).toEqual([])
    expect(filterPinglun(pinglun, { keyword: '不存在' })).toEqual([])
  })
  it('"全部领域"等同不限', () => {
    expect(filterPinglun(pinglun, { domain: '全部领域' })).toHaveLength(3)
  })
})

const bigArchive: ArchiveCase[] = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  domain: '经济发展',
  title: `案例${i}`,
  text: `正文${i}`,
  source: '新华社'
}))

describe('hashDate', () => {
  it('同一日期结果相同（确定性）', () => {
    expect(hashDate('2026-08-01')).toBe(hashDate('2026-08-01'))
  })
  it('返回非负整数', () => {
    for (const d of ['', '2026-08-01', '2026-12-31', 'abc']) {
      const h = hashDate(d)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('fallbackCases（空包兜底）', () => {
  it('同一天刷新结果不变', () => {
    const a = fallbackCases(bigArchive, '2026-08-01')
    const b = fallbackCases(bigArchive, '2026-08-01')
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(a).toHaveLength(5)
  })
  it('换一天自动换一批（起始位置随日期 hash 变化）', () => {
    const starts = new Set(
      ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(
        (d) => fallbackCases(bigArchive, d)[0].id
      )
    )
    expect(starts.size).toBeGreaterThan(1)
  })
  it('换一批：offset 步进 +5 轮换，环绕取模', () => {
    const first = fallbackCases(bigArchive, '2026-08-01', 0)
    const second = fallbackCases(bigArchive, '2026-08-01', 5)
    const start = (hashDate('2026-08-01') + 0) % bigArchive.length
    expect(second[0].id).toBe(bigArchive[(start + 5) % bigArchive.length].id)
    // 两组不重叠（库大于 10 条时）
    expect(second.map((c) => c.id).some((id) => first.map((c) => c.id).includes(id))).toBe(false)
  })
  it('库为空返回空；库不足 5 条时全部返回', () => {
    expect(fallbackCases([], '2026-08-01')).toEqual([])
    expect(fallbackCases(cases, '2026-08-01')).toHaveLength(3)
  })
})

describe('pickCaseRec（两种模式统一入口）', () => {
  const dailyCases: CaseItem[] = [
    { title: '当日案例', summary: '摘要', themes: ['经济'], usage: '用法', source: '人民日报' }
  ]
  it('当日包有 cases 时不走兜底', () => {
    const r = pickCaseRec(dailyCases, bigArchive, '2026-08-01')
    expect(r.mode).toBe('daily')
    expect(r.items).toBe(dailyCases)
  })
  it('cases 为空/缺失时走案例库兜底', () => {
    for (const empty of [[], null, undefined] as (CaseItem[] | null | undefined)[]) {
      const r = pickCaseRec(empty, bigArchive, '2026-08-01')
      expect(r.mode).toBe('archive')
      expect(r.items).toHaveLength(5)
    }
  })
  it('兜底模式下 offset 步进换一批', () => {
    const a = pickCaseRec([], bigArchive, '2026-08-01', 0)
    const b = pickCaseRec([], bigArchive, '2026-08-01', 5)
    expect(a.mode).toBe('archive')
    expect(b.mode).toBe('archive')
    if (a.mode === 'archive' && b.mode === 'archive') {
      expect(a.items[0].id).not.toBe(b.items[0].id)
    }
  })
})

describe('filterShizheng（时政库检索）', () => {
  const months: ShizhengMonth[] = [
    {
      month: '2026-07',
      items: [
        { title: '城市工作会议召开', points: [], domains: ['经济发展'], reading: '', analysis: '城市更新进入存量时代', source: '新华社' },
        { title: '乡村全面振兴规划发布', points: [], domains: ['乡村振兴'], reading: '新传视角解读', source: '人民日报' }
      ]
    },
    {
      month: '2026-06',
      items: [
        { title: '生态文明示范区扩容', points: [], domains: ['生态文明'], reading: '', source: '央视新闻' }
      ]
    }
  ]
  it('空关键词返回全部分区', () => {
    const r = filterShizheng(months, '')
    expect(r.map((m) => m.month)).toEqual(['2026-07', '2026-06'])
    expect(r[0].items).toHaveLength(2)
  })
  it('关键词命中 title/analysis/reading/domains 任一，且剔除空分区', () => {
    expect(filterShizheng(months, '城市').map((m) => m.month)).toEqual(['2026-07'])
    expect(filterShizheng(months, '存量')[0].items[0].title).toContain('城市')
    expect(filterShizheng(months, '新传')[0].items[0].title).toContain('乡村')
    expect(filterShizheng(months, '生态文明').map((m) => m.month)).toEqual(['2026-06'])
    expect(filterShizheng(months, '不存在')).toEqual([])
  })
})

describe('pickDailyKnowledge（每日纠错轮换）', () => {
  const list: KnowledgeItem[] = Array.from({ length: 36 }, (_, i) => ({
    id: `k${i}`,
    point: `知识点${i}`,
    wrong: 'w',
    right: 'r',
    note: 'n'
  }))
  it('同一天结果确定不变；序号为 1 起算', () => {
    const a = pickDailyKnowledge(list, '2026-08-01')
    const b = pickDailyKnowledge(list, '2026-08-01')
    expect(a).not.toBeNull()
    expect(a!.index).toBe(b!.index)
    expect(a!.item.id).toBe(b!.item.id)
    expect(a!.index).toBeGreaterThanOrEqual(1)
    expect(a!.index).toBeLessThanOrEqual(36)
  })
  it('按当年第几天取模：相邻两天轮换一条', () => {
    const a = pickDailyKnowledge(list, '2026-03-01')!
    const b = pickDailyKnowledge(list, '2026-03-02')!
    expect(b.index).toBe((a.index % 36) + 1)
  })
  it('跨年重新计数：次年 01-01 从第 1 条开始', () => {
    // 轮换按「当年」第几天取模，跨年日序归零，不保证与 12-31 连续
    const b = pickDailyKnowledge(list, '2026-01-01')!
    expect(b.index).toBe(1)
    expect(b.item.id).toBe('k0')
  })
  it('空题库返回 null', () => {
    expect(pickDailyKnowledge([], '2026-08-01')).toBeNull()
  })
})
