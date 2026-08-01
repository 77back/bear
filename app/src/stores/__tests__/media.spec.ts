import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContentStore } from '../content'

const ORGS = [
  { id: 'o1', org: '新华社', point: '国家通讯社', detail: '详情', tag: '常识' }
]
const KNOW = [
  { id: 'k1', question: '一带一路的带是什么', answer: '丝绸之路经济带', domain: '时政热点', tag: '考过' }
]
const PLANS = [
  { id: 'p1', type: '采访策划', topic: '乡村振兴', title: '返乡青年', points: ['采访对象：农户'], note: '备注' }
]
const REPORTS = [
  { id: 'r1', title: '县级融媒体调研报告', outline: ['标题', '背景'], tips: '数据先行' }
]

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

describe('content store 媒体备考 loadMedia', () => {
  it('四个文件齐全 → 全部填充', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('content/media/orgs.json')) return ok(ORGS)
      if (url.includes('content/media/mediaKnowledge.json')) return ok(KNOW)
      if (url.includes('content/media/plans.json')) return ok(PLANS)
      if (url.includes('content/media/reports.json')) return ok(REPORTS)
      return notFound()
    }) as unknown as typeof globalThis.fetch

    const c = useContentStore()
    await c.loadMedia()
    expect(c.mediaOrgs).toHaveLength(1)
    expect(c.mediaKnowledge).toHaveLength(1)
    expect(c.mediaPlans).toHaveLength(1)
    expect(c.mediaReports).toHaveLength(1)
    expect(c.mediaOrgs[0].org).toBe('新华社')
  })

  it('全部文件缺失（旧部署）→ 优雅降级为空数组，不抛错', async () => {
    globalThis.fetch = vi.fn(async () => notFound()) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.loadMedia()
    expect(c.mediaOrgs).toEqual([])
    expect(c.mediaKnowledge).toEqual([])
    expect(c.mediaPlans).toEqual([])
    expect(c.mediaReports).toEqual([])
  })

  it('单个文件缺失 → 仅该数组为空，其余正常', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('content/media/orgs.json')) return ok(ORGS)
      if (url.includes('content/media/plans.json')) return ok(PLANS)
      return notFound() // mediaKnowledge / reports 缺失
    }) as unknown as typeof globalThis.fetch
    const c = useContentStore()
    await c.loadMedia()
    expect(c.mediaOrgs).toHaveLength(1)
    expect(c.mediaPlans).toHaveLength(1)
    expect(c.mediaKnowledge).toEqual([])
    expect(c.mediaReports).toEqual([])
  })
})
