import { describe, it, expect } from 'vitest'
import { kwMatch, monthsOf, filterCases, filterPinglun } from '@/core/library'
import type { ArchiveCase, PinglunEntry } from '@/stores/content'

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
