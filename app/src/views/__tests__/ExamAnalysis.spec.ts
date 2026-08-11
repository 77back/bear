import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ExamAnalysis from '../sub/ExamAnalysis.vue'

function settle(ms = 60) {
  return new Promise((r) => setTimeout(r, ms))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
}

// EChart 走 canvas，jsdom 不可用；stub 拦截以断言传入的 option 数据
const EChartStub = {
  name: 'EChart',
  props: ['option', 'height'],
  template: '<div class="echart-stub" />'
}

const ANALYSIS = {
  total: 100,
  institutions: [
    {
      name: '新华社',
      total: 60,
      boards: [
        { label: '行测常识', count: 50 },
        { label: '媒体常识', count: 10 }
      ],
      kinds: [
        { kind: 'single', label: '单选', count: 40 },
        { kind: 'judge', label: '判断', count: 20 }
      ]
    },
    {
      name: '时政押题',
      total: 40,
      boards: [{ label: '时政', count: 40 }],
      kinds: [{ kind: 'single', label: '单选', count: 40 }]
    }
  ],
  shizheng: {
    byMonth: [
      { label: '1月', count: 25 },
      { label: '2月', count: 15 }
    ],
    byDomain: [
      { label: '科技成就', count: 18 },
      { label: '经济金融', count: 12 }
    ]
  },
  narratives: [
    {
      institution: '新华社',
      note: '行测/公基 + 时政 + 写作',
      sections: [
        { title: '笔试结构', items: ['笔试 150 分钟', '800 字综述 30 分'] },
        { title: '面试', items: ['自我介绍 → 抽取题目'] }
      ]
    },
    {
      institution: '时政押题',
      note: '按月滚动更新',
      sections: [{ title: '说明', items: ['每月一更'] }]
    }
  ]
}

let originalFetch: typeof globalThis.fetch

function mockFetchOk() {
  return (async () => ({ ok: true, status: 200, json: async () => ANALYSIS })) as unknown as typeof fetch
}

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('ExamAnalysis 考情分析', () => {
  it('渲染标题/副标题、机构区块、note 与题量', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mount(ExamAnalysis, {
      global: { plugins: [makeRouter()], stubs: { EChart: EChartStub } }
    })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('考情分析')
    expect(text).toContain('100 题 · 2 大来源')
    expect(text).toContain('新华社')
    expect(text).toContain('60 题')
    expect(text).toContain('行测/公基 + 时政 + 写作')
    expect(text).toContain('时政押题')
    expect(text).toContain('按月滚动更新')
  })

  it('考情要点：sections 渲染为小标题 + 条目列表', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mount(ExamAnalysis, {
      global: { plugins: [makeRouter()], stubs: { EChart: EChartStub } }
    })
    await settle()

    const secs = wrapper.findAll('.exam-sec')
    expect(secs).toHaveLength(3) // 新华社 2 + 时政押题 1
    const text = wrapper.text()
    expect(text).toContain('笔试结构')
    expect(text).toContain('笔试 150 分钟')
    expect(text).toContain('800 字综述 30 分')
    expect(text).toContain('面试')
    expect(text).toContain('自我介绍 → 抽取题目')
    expect(wrapper.findAll('.exam-item').length).toBe(4) // 新华社 3 + 时政押题 1
  })

  it('图表接入：总览 1 + 每机构 2 + 押题额外 2，数据正确传入 option', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mount(ExamAnalysis, {
      global: { plugins: [makeRouter()], stubs: { EChart: EChartStub } }
    })
    await settle()

    const charts = wrapper.findAllComponents(EChartStub)
    expect(charts).toHaveLength(7) // 1 总览 + 新华社 2 + 时政押题 4
    const options = charts.map((c) => c.props('option') as any)

    // 总览横向条形图：机构题量
    const overview = options[0]
    expect(overview.yAxis.data).toEqual(['时政押题', '新华社']) // 量小在下、量大在上
    expect(overview.series[0].data).toEqual([40, 60])

    // 题型饼图：新华社 kinds
    const pieOpt = options.find((o) => o.series?.[0]?.type === 'pie')
    expect(pieOpt.series[0].data.map((d: any) => d.name)).toEqual(['单选', '判断'])

    // 押题按月柱状图
    const byMonth = options.find((o) => o.xAxis?.type === 'category' && o.xAxis.data?.includes('1月'))
    expect(byMonth.series[0].data).toEqual([25, 15])

    // 押题按领域横向条形图
    const byDomain = options.find((o) => o.yAxis?.data?.includes('经济金融'))
    expect(byDomain.yAxis.data).toEqual(['经济金融', '科技成就'])
    expect(byDomain.series[0].data).toEqual([12, 18])
  })

  it('加载失败优雅降级', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const wrapper = mount(ExamAnalysis, {
      global: { plugins: [makeRouter()], stubs: { EChart: EChartStub } }
    })
    await settle()
    expect(wrapper.text()).toContain('考情数据暂未上线')
    expect(wrapper.findAllComponents(EChartStub)).toHaveLength(0)
  })
})
