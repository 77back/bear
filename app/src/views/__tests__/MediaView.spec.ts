import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MediaView from '../MediaView.vue'

function settle(ms = 60) {
  return new Promise((r) => setTimeout(r, ms))
}

const ORGS = [
  { id: 'o1', org: '新华社', point: '前身红中社', detail: '1931年江西瑞金成立', tag: '常识' },
  { id: 'o2', org: '人民日报', point: '创刊时间', detail: '1948年6月15日', tag: '考过' }
]
const KNOW = [
  { id: 'k1', question: '一带一路的带是什么', answer: '丝绸之路经济带', domain: '时政热点', tag: '考过' }
]
const PLANS = [
  { id: 'p1', type: '采访策划', topic: '乡村振兴', title: '返乡创业青年', points: ['采访对象：农户'], note: '核实数据' },
  { id: 'p2', type: '报道策划', topic: '文旅融合', title: '跟着文物游中原', points: ['Vlog'], note: '三方联动' }
]
const REPORTS = [
  { id: 'r1', title: '县级融媒体调研报告', outline: ['标题', '调研背景'], tips: '数据先行' }
]

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}
function notFound() {
  return { ok: false, status: 404, json: async () => ({}) }
}

function mockMedia(all = true) {
  globalThis.fetch = vi.fn(async (url: string) => {
    if (!all) return notFound()
    if (url.includes('content/media/orgs.json')) return ok(ORGS)
    if (url.includes('content/media/mediaKnowledge.json')) return ok(KNOW)
    if (url.includes('content/media/plans.json')) return ok(PLANS)
    if (url.includes('content/media/reports.json')) return ok(REPORTS)
    return notFound()
  }) as unknown as typeof globalThis.fetch
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('MediaView 媒体备考', () => {
  it('默认渲染机构常识分区，其余分区隐藏；展开显示详情', async () => {
    mockMedia()
    const wrapper = mount(MediaView)
    await settle()

    const text = wrapper.text()
    expect(text).toContain('媒体备考')
    expect(text).toContain('机构常识')
    expect(text).toContain('前身红中社')
    expect(text).not.toContain('一带一路的带是什么') // 媒体常识分区未激活
    expect(text).not.toContain('县级融媒体调研报告')

    // 行内展开
    await wrapper.find('.case-row').trigger('click')
    expect(wrapper.text()).toContain('1931年江西瑞金成立')
  })

  it('分区切换：媒体常识 / 采访策划 / 报道策划 / 调研报告', async () => {
    mockMedia()
    const wrapper = mount(MediaView)
    await settle()

    const chips = wrapper.findAll('.chip-row .chip')
    // 分区 chips 为前 5 个（机构常识分区内还有机构筛选 chips，但默认分区不是它时不渲染）
    await chips[1].trigger('click') // 媒体常识
    expect(wrapper.text()).toContain('一带一路的带是什么')
    expect(wrapper.text()).not.toContain('前身红中社')

    await chips[2].trigger('click') // 采访策划
    expect(wrapper.text()).toContain('返乡创业青年')
    expect(wrapper.text()).not.toContain('跟着文物游中原') // 报道策划不在此分区

    await chips[3].trigger('click') // 报道策划
    expect(wrapper.text()).toContain('跟着文物游中原')

    await chips[4].trigger('click') // 调研报告
    expect(wrapper.text()).toContain('县级融媒体调研报告')
  })

  it('跨分区搜索：关键词命中多个分区时同时展示', async () => {
    mockMedia()
    const wrapper = mount(MediaView)
    await settle()

    const input = wrapper.find('input.input')
    await input.setValue('融媒体')
    const text = wrapper.text()
    expect(text).toContain('县级融媒体调研报告') // 调研报告命中
    // 「返乡创业青年」不含「融媒体」→ 采访策划分区不展示
    expect(text).not.toContain('返乡创业青年')

    await input.setValue('新华社')
    expect(wrapper.text()).toContain('前身红中社')

    await input.setValue('不存在的关键词xyz')
    expect(wrapper.text()).toContain('没有匹配')
  })

  it('机构常识分区内按机构 chip 筛选', async () => {
    mockMedia()
    const wrapper = mount(MediaView)
    await settle()

    const chips = wrapper.findAll('.chip')
    const rb = chips.find((c) => c.text() === '人民日报')!
    await rb.trigger('click')
    const text = wrapper.text()
    expect(text).toContain('创刊时间')
    expect(text).not.toContain('前身红中社')
  })

  it('四个文件全部缺失 → 优雅降级，页面正常渲染不报错', async () => {
    mockMedia(false)
    const wrapper = mount(MediaView)
    await settle()
    const text = wrapper.text()
    expect(text).toContain('媒体备考')
    expect(text).toContain('暂无匹配内容')
  })
})
