import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentStore } from '../content'
import type { DailyPackage } from '../content'

const PKG: DailyPackage = {
  date: '2026-07-29',
  cases: [{ title: '林丹', summary: '社区', themes: ['基层治理'], usage: '用法', source: '求是网' }],
  article: { title: '时评', url: '', structure: [], quotes: [], source: '' },
  shiwu: { material: { title: '遥感卫星', body: '正文', source: '新华社' }, exercises: [] },
  structure: { name: '五段三分式', nodes: [], fragment: '' },
  guoji: []
}

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}
function notFound() {
  return { ok: false, status: 404, json: async () => ({}) }
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(routes: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (url: string) => {
    for (const key of Object.keys(routes)) {
      if (url.includes(key)) return ok(routes[key])
    }
    return notFound()
  }) as unknown as typeof globalThis.fetch
}

describe('content store（阶段3 读取当日包）', () => {
  it('load 成功：index.latest → 当日包填充', async () => {
    mockFetch({
      'content/index.json': { latest: '2026-07-29', dates: ['2026-07-29'] },
      'content/daily/2026-07-29.json': PKG
    })
    const c = useContentStore()
    await c.load()
    expect(c.latest).toBe('2026-07-29')
    expect(c.daily?.cases[0].title).toBe('林丹')
    expect(c.error).toBe('')
  })

  it('断网/最新缺失：回退到 dates 中最近可用（断网显示最近一次内容）', async () => {
    mockFetch({
      'content/index.json': { latest: '2026-07-30', dates: ['2026-07-30', '2026-07-29', '2026-07-28'] }
      // 2026-07-30 与 2026-07-28 均 404，仅 2026-07-29 命中
    })
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('content/index.json')) return ok({ latest: '2026-07-30', dates: ['2026-07-30', '2026-07-29', '2026-07-28'] })
      if (url.includes('daily/2026-07-29.json')) return ok(PKG)
      return notFound()
    }) as unknown as typeof globalThis.fetch

    const c = useContentStore()
    await c.load()
    expect(c.daily?.date).toBe('2026-07-29')
    expect(c.latest).toBe('2026-07-29')
  })

  it('index 也取不到 → error，daily 为空', async () => {
    globalThis.fetch = vi.fn(async () => notFound()) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.load()
    expect(c.daily).toBeNull()
    expect(c.error).not.toBe('')
  })

  it('nextDaily：在 dates 中循环切换内容包（换一批）', async () => {
    const PKG2: DailyPackage = {
      ...PKG,
      date: '2026-07-30',
      cases: [{ title: '乙案例', summary: '另一则', themes: [], usage: '', source: '人民日报' }]
    }
    mockFetch({
      'content/index.json': { latest: '2026-07-30', dates: ['2026-07-30', '2026-07-29'] },
      'content/daily/2026-07-30.json': PKG2,
      'content/daily/2026-07-29.json': PKG
    })
    const c = useContentStore()
    await c.load()
    expect(c.daily?.date).toBe('2026-07-30')
    await c.nextDaily()
    expect(c.daily?.date).toBe('2026-07-29')
    expect(c.daily?.cases[0].title).toBe('林丹')
    await c.nextDaily() // 循环回最新
    expect(c.daily?.date).toBe('2026-07-30')
    expect(c.daily?.cases[0].title).toBe('乙案例')
  })

  it('nextDaily：仅一个日期可用时无操作', async () => {
    mockFetch({
      'content/index.json': { latest: '2026-07-29', dates: ['2026-07-29'] },
      'content/daily/2026-07-29.json': PKG
    })
    const c = useContentStore()
    await c.load()
    await c.nextDaily()
    expect(c.daily?.date).toBe('2026-07-29')
  })

  it('loadArchive 成功：归档案例填充', async () => {
    mockFetch({
      'content/archive/cases.json': [
        { id: 'a1', date: '2026-07-29', domain: '乡村振兴', title: '案例A', text: '正文', source: '新华社', url: 'http://a' }
      ]
    })
    const c = useContentStore()
    await c.loadArchive()
    expect(c.archive.length).toBe(1)
    expect(c.archive[0].domain).toBe('乡村振兴')
  })

  it('loadArchive 文件不存在（旧部署）：优雅降级为空数组', async () => {
    globalThis.fetch = vi.fn(async () => notFound()) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.loadArchive()
    expect(c.archive).toEqual([])
  })
})

describe('时政库 loadShizhengAll', () => {
  const M7 = { month: '2026-07', items: [{ title: '会议A', points: [], domains: ['经济发展'], reading: '', analysis: '解读A', source: '新华社' }] }
  const M6 = { month: '2026-06', items: [{ title: '规划B', points: [], domains: [], reading: '', source: '人民日报' }] }

  it('按 index 月份清单逐月加载，新→旧排序', async () => {
    mockFetch({
      'content/shizheng/index.json': { months: ['2026-06', '2026-07'] },
      'content/shizheng/2026-07.json': M7,
      'content/shizheng/2026-06.json': M6
    })
    const c = useContentStore()
    await c.loadShizhengAll()
    expect(c.shizhengMonths.map((m) => m.month)).toEqual(['2026-07', '2026-06'])
    expect(c.shizhengMonths[0].items[0].analysis).toBe('解读A')
  })

  it('index 不存在（旧部署）：优雅降级为当月，当月也取不到则为空', async () => {
    globalThis.fetch = vi.fn(async () => notFound()) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.loadShizhengAll()
    expect(c.shizhengMonths).toEqual([])
  })

  it('单月文件缺失：跳过该月，不影响其他月份', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('shizheng/index.json')) return ok({ months: ['2026-06', '2026-07'] })
      if (url.includes('shizheng/2026-06.json')) return ok(M6)
      return notFound() // 2026-07 缺失
    }) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.loadShizhengAll()
    expect(c.shizhengMonths.map((m) => m.month)).toEqual(['2026-06'])
  })

  it('loadKnowledge 成功加载 / 文件缺失降级为空数组', async () => {
    mockFetch({
      'content/shiwu/knowledge.json': [{ id: 'k01', point: '时间表述须具体', wrong: 'w', right: 'r', note: 'n' }]
    })
    const c = useContentStore()
    await c.loadKnowledge()
    expect(c.knowledge).toHaveLength(1)
    expect(c.knowledge[0].point).toBe('时间表述须具体')

    globalThis.fetch = vi.fn(async () => notFound()) as unknown as typeof globalThis.fetch
    const c2 = useContentStore()
    await c2.loadKnowledge()
    expect(c2.knowledge).toEqual([])
  })
})
