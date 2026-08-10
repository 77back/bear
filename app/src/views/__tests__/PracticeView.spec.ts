import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PracticeView from '../PracticeView.vue'
import { db, todayStr } from '@/db'

function settle(ms = 80) {
  return new Promise((r) => setTimeout(r, ms))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
}

const CARDS = [
  {
    id: 'a-1',
    kind: 'single',
    stem: '1+1=?',
    options: { A: '1', B: '2', C: '3', D: '4' },
    answer: 'B',
    analysis: '基础算术',
    tags: ['行测常识', '法律'],
    source: { institution: '新华社', doc: '题库1', reliability: '机构题库' }
  },
  {
    id: 'a-2',
    kind: 'single',
    stem: '2+2=?',
    options: { A: '3', B: '4' },
    answer: 'B',
    analysis: '',
    tags: ['行测常识', '法律'],
    source: { institution: '新华社', doc: '题库1', reliability: '机构题库' }
  },
  {
    id: 'a-3',
    kind: 'fill',
    stem: '人民日报创刊于____年',
    answer: '1948',
    analysis: '',
    tags: ['新闻实务'],
    source: { institution: '人民日报', doc: '笔试', reliability: '真题合集' }
  },
  {
    id: 'y-1',
    kind: 'single',
    stem: '时政题',
    options: { A: '甲', B: '乙' },
    answer: 'A',
    analysis: '',
    tags: ['时政', '科技成就'],
    source: { institution: '时政押题', doc: '1月份押题（带答案版）', reliability: '押题' }
  }
]

const INDEX = [
  { key: 'a', institution: '新华社', doc: '题库1', count: 2, reliability: '机构题库', tags: ['行测常识'] },
  { key: 'b', institution: '人民日报', doc: '笔试', count: 1, reliability: '真题合集', tags: ['新闻实务'] },
  { key: 'c', institution: '时政押题', doc: '1月份押题（带答案版）', count: 1, reliability: '押题', tags: ['时政'] }
]

function mockFetch() {
  return (async (url: string) => {
    const data = url.includes('index.json')
      ? INDEX
      : url.includes('cards-a')
        ? CARDS.slice(0, 2)
        : url.includes('cards-b')
          ? CARDS.slice(2, 3)
          : CARDS.slice(3)
    return { ok: true, status: 200, json: async () => data }
  }) as unknown as typeof fetch
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  setActivePinia(createPinia())
  originalFetch = globalThis.fetch
  globalThis.fetch = mockFetch()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('PracticeView 刷题主页', () => {
  it('渲染标题、工具行角标与机构分类树（无记录时进度为 0）', async () => {
    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('刷题')
    expect(text).toContain('4 题 · 新华社/人民日报/时政押题')
    // 工具行三张卡片
    const tools = wrapper.findAll('.tool-card')
    expect(tools).toHaveLength(3)
    expect(tools[0].text()).toContain('今日复习')
    expect(tools[0].text()).toContain('0')
    expect(tools[1].text()).toContain('错题本')
    expect(tools[2].text()).toContain('随心练习')

    // 机构卡片未展开时只显示机构名与进度
    expect(text).toContain('新华社')
    expect(text).toContain('做过 0 / 2 · 掌握 0')
    expect(text).not.toContain('行测常识')

    // 展开机构 → 二级分组出现（行测常识仅 1 个二级考点 → 叶子）
    await wrapper.find('.tree-head').trigger('click')
    expect(wrapper.text()).toContain('行测常识')
    const leaves = wrapper.findAll('.tree-row.leaf')
    expect(leaves).toHaveLength(1)
    expect(leaves[0].text()).toContain('行测常识')
    expect(leaves[0].text()).toContain('0/2 · 掌握 0')
  })

  it('点击叶子节点进入刷题会话，判分并记录', async () => {
    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()

    await wrapper.find('.tree-head').trigger('click') // 展开新华社
    await wrapper.find('.tree-row.leaf').trigger('click') // 行测常识
    await settle(20)

    expect(wrapper.text()).toMatch(/第 1 \/ 2 题/)
    const opts = wrapper.findAll('.opt')
    expect(opts.length).toBeGreaterThan(0)
    // 点正确项 B（两张卡答案都是 B）
    await opts.find((o) => o.text().startsWith('B'))!.trigger('click')
    await settle(20)
    expect(wrapper.text()).toContain('答对了')

    const attempts = await db.cardAttempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0].correct).toBe(true)
  })

  it('工具行角标反映 SRS 到期数与错题数，今日复习直达会话', async () => {
    const today = todayStr()
    await db.cardStates.put({
      cardId: 'a-1', seen: 1, correctCount: 0, wrongCount: 1, streak: 0,
      mastered: false, lastAt: 0, srsStage: 0, dueDate: today
    })
    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()

    const tools = wrapper.findAll('.tool-card')
    expect(tools[0].text()).toContain('1') // 今日复习到期 1
    expect(tools[1].text()).toContain('1') // 错题本 1

    await tools[0].trigger('click')
    await settle(20)
    expect(wrapper.text()).toContain('今日复习')
    expect(wrapper.text()).toMatch(/第 1 \/ 1 题/)
  })

  it('错题本直达错题专练会话', async () => {
    await db.cardStates.put({
      cardId: 'a-3', seen: 2, correctCount: 0, wrongCount: 1, streak: 0,
      mastered: false, lastAt: 0
    })
    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()

    await wrapper.findAll('.tool-card')[1].trigger('click')
    await settle(20)
    expect(wrapper.text()).toContain('错题本')
    expect(wrapper.text()).toMatch(/第 1 \/ 1 题/)
    // 填空题：翻面自评
    await wrapper.findAll('button').find((b) => b.text() === '看答案')!.trigger('click')
    await settle(20)
    await wrapper.findAll('button').find((b) => b.text() === '答对')!.trigger('click')
    await settle(20)
    const st = await db.cardStates.get('a-3')
    expect(st?.correctCount).toBe(1)
  })

  it('随心练习进入 ≤10 题随机会话，答完进入结算页', async () => {
    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()

    await wrapper.findAll('.tool-card')[2].trigger('click')
    await settle(20)
    expect(wrapper.text()).toMatch(/第 1 \/ 4 题/)

    for (let i = 0; i < 4; i++) {
      const opts = wrapper.findAll('.opt')
      if (opts.length) {
        await opts[0].trigger('click')
      } else {
        await wrapper.findAll('button').find((b) => b.text() === '看答案')!.trigger('click')
        await settle(20)
        await wrapper.findAll('button').find((b) => b.text() === '答对')!.trigger('click')
      }
      await settle(20)
      const next = wrapper.findAll('button').find((b) => ['下一题', '完成'].includes(b.text()))
      if (next) await next.trigger('click')
      await settle(20)
    }
    expect(wrapper.text()).toContain('本轮完成')
    expect(await db.cardAttempts.count()).toBe(4)
  })

  it('问答卡：输入回答 → 查看参考答案 → 上下对照 → 自评记录', async () => {
    globalThis.fetch = (async (url: string) => {
      const data = url.includes('index.json')
        ? [{ key: 'q', institution: '新华社', doc: '问答', count: 1, reliability: '机构题库', tags: ['媒体常识'] }]
        : [
            {
              id: 'q-1',
              kind: 'qa',
              stem: '简述新华社的职能',
              answer: '参考答案文本',
              analysis: '解析文本',
              tags: ['媒体常识'],
              source: { institution: '新华社', doc: '问答', reliability: '机构题库' }
            }
          ]
      return { ok: true, status: 200, json: async () => data }
    }) as unknown as typeof fetch

    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()
    await wrapper.find('.tree-head').trigger('click')
    await wrapper.find('.tree-row.leaf').trigger('click')
    await settle(20)

    // 先出输入框 + 查看参考答案按钮
    const ta = wrapper.find('textarea.qa-input')
    expect(ta.exists()).toBe(true)
    await ta.setValue('我的回答内容')
    await wrapper.findAll('button').find((b) => b.text() === '查看参考答案')!.trigger('click')
    await settle(20)

    // 上下对照：我的回答在上，参考答案/解析在下
    const text = wrapper.text()
    expect(text).toContain('我的回答')
    expect(text).toContain('我的回答内容')
    expect(text).toContain('参考答案')
    expect(text).toContain('参考答案文本')
    expect(text).toContain('解析文本')

    // 自评"答对" → 走同一套 recordAttempt/SRS 流程
    await wrapper.findAll('button').find((b) => b.text() === '答对')!.trigger('click')
    await settle(20)
    const attempts = await db.cardAttempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ cardId: 'q-1', correct: true, selfGrade: 'know' })
  })

  it('问答卡：不输入也能直接看答案（无"我的回答"块）', async () => {
    globalThis.fetch = (async (url: string) => {
      const data = url.includes('index.json')
        ? [{ key: 'q', institution: '新华社', doc: '问答', count: 1, reliability: '机构题库', tags: ['媒体常识'] }]
        : [
            {
              id: 'q-1',
              kind: 'qa',
              stem: '简述新华社的职能',
              answer: '参考答案文本',
              analysis: '',
              tags: ['媒体常识'],
              source: { institution: '新华社', doc: '问答', reliability: '机构题库' }
            }
          ]
      return { ok: true, status: 200, json: async () => data }
    }) as unknown as typeof fetch

    const wrapper = mount(PracticeView, { global: { plugins: [makeRouter()] } })
    await settle()
    await wrapper.find('.tree-head').trigger('click')
    await wrapper.find('.tree-row.leaf').trigger('click')
    await settle(20)

    await wrapper.findAll('button').find((b) => b.text() === '查看参考答案')!.trigger('click')
    await settle(20)
    expect(wrapper.text()).toContain('参考答案文本')
    expect(wrapper.text()).not.toContain('我的回答')
  })
})
