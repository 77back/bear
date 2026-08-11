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
  note: '只分析真实考试的考情（真题合集 + 一手回忆），不含机构汇编题库、押题与资料提炼卡',
  comparison: [
    { name: '新华社', structure: '行测/公基 + 时政 + 写作 + 心理测试', duration: '笔试 150 分钟 + 心理测试 60 分钟', feature: '时政填空是特色' },
    { name: '人民日报', structure: '一轮：行测 88% + 时政；次轮：分岗位实务', duration: '以当年公告为准', feature: '次轮考真功夫' },
    { name: '总台', structure: '媒体常识 100%，不考行测', duration: '以当年公告为准', feature: '行业规范是核心' }
  ],
  institutions: [
    {
      name: '新华社',
      realQuestions: 0,
      boards: [],
      kinds: [],
      scoreStructure: [
        { label: '主观大题（消息/短评/综述）', value: 60 },
        { label: '填空（社史+时政）', value: 25 },
        { label: '选择', value: 5 }
      ],
      timeStructure: [
        { label: '笔试', value: 150 },
        { label: '心理测试（225 道涂卡）', value: 60 }
      ]
    },
    {
      name: '人民日报',
      realQuestions: 428,
      boards: [
        { label: '行测-常识', count: 118 },
        { label: '行测-言语', count: 89 },
        { label: '时政', count: 39 }
      ],
      kinds: [
        { kind: 'single', label: '单选', count: 409 },
        { kind: 'judge', label: '判断', count: 10 }
      ],
      round2Count: 134,
      round2Posts: [
        { post: '采编岗', items: ['消息改写 600 字（30 分）', '新闻评论 800 字（40 分）'] },
        { post: '国际传播岗', items: ['中译英 10 分 + 英译中 10 分'] },
        { post: '综合管理岗', items: ['公文写作：通知 / 请示'] }
      ]
    },
    {
      name: '总台',
      realQuestions: 363,
      boards: [{ label: '媒体常识', count: 363 }],
      kinds: [
        { kind: 'single', label: '单选', count: 246 },
        { kind: 'multi', label: '多选', count: 66 }
      ],
      domains: [
        { label: '行业规范', count: 118 },
        { label: '战略与政策', count: 111 },
        { label: '机构业务与平台', count: 82 }
      ]
    }
  ],
  narratives: [
    {
      institution: '新华社',
      note: '无真题卷流入，考情全部来自考生一手回忆；题库中 993 道行测题为机构汇编，不反映真实考情',
      sections: [{ title: '笔试结构', items: ['笔试 150 分钟 + 心理测试 1 小时'] }]
    },
    {
      institution: '人民日报',
      note: '一轮分布基于历年真题统计；次轮为考生回忆，无标准答案',
      sections: [{ title: '一轮笔试', items: ['行测是绝对主体（约 88%）'] }]
    },
    {
      institution: '总台',
      note: '分布基于 2023-2025 真题统计',
      sections: [{ title: '复试结构', items: ['媒体常识 100%'] }]
    }
  ]
}

let originalFetch: typeof globalThis.fetch

function mockFetchOk() {
  return (async () => ({ ok: true, status: 200, json: async () => ANALYSIS })) as unknown as typeof fetch
}

function mountPage() {
  return mount(ExamAnalysis, {
    global: { plugins: [makeRouter()], stubs: { EChart: EChartStub } }
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('ExamAnalysis 考情分析（真实考情口径）', () => {
  it('渲染标题、分析口径说明与三家对比表', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mountPage()
    await settle()

    const text = wrapper.text()
    expect(text).toContain('考情分析')
    expect(text).toContain('只分析真实考试的考情')
    // 对比表：三行，结构/时长/特点
    const rows = wrapper.findAll('.cmp-row')
    expect(rows).toHaveLength(3)
    expect(text).toContain('三家考试对比')
    expect(text).toContain('行测/公基 + 时政 + 写作 + 心理测试')
    expect(text).toContain('笔试 150 分钟 + 心理测试 60 分钟')
    expect(text).toContain('媒体常识 100%，不考行测')
    // 押题不是考试：页面不出现时政押题区块
    expect(text).not.toContain('时政押题')
    expect(text).not.toContain('按月分布')
  })

  it('新华社：分值构成 + 环节时长图，无板块/题型分布图，note 说明机构汇编口径', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mountPage()
    await settle()

    const text = wrapper.text()
    expect(text).toContain('993 道行测题为机构汇编，不反映真实考情')
    expect(text).toContain('分值构成（满分 100）')
    expect(text).toContain('环节时长')
    expect(text).toContain('考生一手回忆') // realQuestions=0 的角标

    const options = wrapper.findAllComponents(EChartStub).map((c) => c.props('option') as any)
    // 分值构成横向条形图（量小在下、量大在上）
    const score = options.find((o) => o.yAxis?.data?.includes('主观大题（消息/短评/综述）'))
    expect(score.yAxis.data).toEqual(['选择', '填空（社史+时政）', '主观大题（消息/短评/综述）'])
    expect(score.series[0].data).toEqual([5, 25, 60])
    // 环节时长
    const time = options.find((o) => o.yAxis?.data?.includes('笔试'))
    expect(time.series[0].data).toEqual([60, 150])
    // 新华社无任何饼图（kinds 为空）；全部饼图来自人民日报/总台，共 2 张
    expect(options.filter((o) => o.series?.[0]?.type === 'pie')).toHaveLength(2)
  })

  it('人民日报：一轮板块图 + 题型饼图 + 次轮三岗位小卡', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mountPage()
    await settle()

    const text = wrapper.text()
    expect(text).toContain('真题统计 428 题')
    expect(text).toContain('一轮板块构成')
    expect(text).toContain('次轮（回忆版 134 题，无标准答案）')
    // 三岗位小卡
    const posts = wrapper.findAll('.post-card')
    expect(posts).toHaveLength(3)
    expect(text).toContain('采编岗')
    expect(text).toContain('消息改写 600 字（30 分）')
    expect(text).toContain('国际传播岗')
    expect(text).toContain('综合管理岗')
    expect(text).toContain('公文写作：通知 / 请示')

    const options = wrapper.findAllComponents(EChartStub).map((c) => c.props('option') as any)
    const boards = options.find((o) => o.yAxis?.data?.includes('行测-常识'))
    expect(boards.series[0].data).toEqual([39, 89, 118])
  })

  it('总台：领域分布图为重点（单板块不出板块图）', async () => {
    globalThis.fetch = mockFetchOk()
    const wrapper = mountPage()
    await settle()

    const text = wrapper.text()
    expect(text).toContain('领域分布')
    expect(text).toContain('分布基于 2023-2025 真题统计')
    // 总台 boards 只有 1 个板块 → 不渲染板块构成图
    const zt = wrapper.findAll('.card').find((c) => c.text().includes('总台'))!
    expect(zt.text()).not.toContain('板块构成')

    const options = wrapper.findAllComponents(EChartStub).map((c) => c.props('option') as any)
    const domains = options.find((o) => o.yAxis?.data?.includes('行业规范'))
    expect(domains.yAxis.data).toEqual(['机构业务与平台', '战略与政策', '行业规范'])
    expect(domains.series[0].data).toEqual([82, 111, 118])

    // 全页图表数：新华社 2 + 人民日报 2 + 总台 2 = 6
    expect(options).toHaveLength(6)
  })

  it('加载失败优雅降级', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const wrapper = mountPage()
    await settle()
    expect(wrapper.text()).toContain('考情数据暂未上线')
    expect(wrapper.findAllComponents(EChartStub)).toHaveLength(0)
  })

  it('旧结构缓存（字段缺失）不白屏', async () => {
    // 旧版 analysis.json：无 note/comparison，institutions 是老字段
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        total: 100,
        institutions: [{ name: '新华社', total: 60, boards: [{ label: '行测常识', count: 50 }], kinds: [] }],
        shizheng: { byMonth: [], byDomain: [] },
        narratives: []
      })
    })) as unknown as typeof fetch
    const wrapper = mountPage()
    await settle()
    const text = wrapper.text()
    expect(text).toContain('新华社') // 机构区块仍渲染
    expect(text).not.toContain('三家考试对比') // comparison 缺失 → 对比表不渲染
    expect(wrapper.findAllComponents(EChartStub).length).toBeGreaterThanOrEqual(0) // 不崩溃
  })
})
