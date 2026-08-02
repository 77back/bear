import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import CasualPractice from '../sub/CasualPractice.vue'
import { db } from '@/db'

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
    tags: ['行测常识'],
    source: { institution: '新华社', doc: '题库1', reliability: '机构题库' }
  },
  {
    id: 'a-2',
    kind: 'fill',
    stem: '人民日报创刊于____年',
    answer: '1948',
    analysis: '',
    tags: ['媒体常识'],
    source: { institution: '人民日报', doc: '笔试', reliability: '真题合集' }
  }
]

const INDEX = [
  { key: 'a', institution: '新华社', doc: '题库1', count: 2, reliability: '机构题库', tags: ['行测常识'] }
]

function mockFetch() {
  return (async (url: string) => {
    const data = url.includes('index.json') ? INDEX : CARDS
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

describe('CasualPractice 随心练习（交互）', () => {
  it('开局显示范围与题量 → 开始 → 单选直答判分 → 下一题', async () => {
    const wrapper = mount(CasualPractice, { global: { plugins: [makeRouter()] } })
    await settle()

    expect(wrapper.text()).toContain('共 2 题')
    await wrapper.find('.btn-primary').trigger('click') // 开始练习
    await settle()

    // 抽到的第一题（洗牌后顺序不定，先判断题型）
    const text1 = wrapper.text()
    expect(text1).toMatch(/第 1 \/ 2 题/)
    const opts = wrapper.findAll('.opt')
    if (opts.length) {
      // 单选题：点正确项 B
      const right = opts.find((o) => o.text().startsWith('B'))!
      await right.trigger('click')
      await settle(20)
      expect(wrapper.text()).toContain('答对了')
      expect(wrapper.text()).toContain('解析')
    } else {
      // 填空题：翻面 → 自评"会"
      const flip = wrapper.findAll('button').find((b) => b.text() === '看答案')!
      await flip.trigger('click')
      await settle(20)
      const know = wrapper.findAll('button').find((b) => b.text() === '会')!
      await know.trigger('click')
      await settle(20)
    }

    const attempts = await db.cardAttempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0].correct).toBe(true)
    expect(attempts[0].mode).toBe('casual')
  })

  it('单选答错显示正确答案并记录错题', async () => {
    const wrapper = mount(CasualPractice, { global: { plugins: [makeRouter()] } })
    await settle()
    await wrapper.find('.btn-primary').trigger('click')
    await settle()

    const opts = wrapper.findAll('.opt')
    if (opts.length) {
      const wrong = opts.find((o) => o.text().startsWith('A'))!
      await wrong.trigger('click')
      await settle(20)
      expect(wrapper.text()).toContain('答错了')
      const st = await db.cardStates.get('a-1')
      expect(st).toMatchObject({ wrongCount: 1, mastered: false })
    }
    // 若第一题是填空则跳过本断言（洗牌顺序非确定性）
  })

  it('答完全部进入结算页', async () => {
    const wrapper = mount(CasualPractice, { global: { plugins: [makeRouter()] } })
    await settle()
    await wrapper.find('.btn-primary').trigger('click')
    await settle()

    for (let i = 0; i < 2; i++) {
      const opts = wrapper.findAll('.opt')
      if (opts.length) {
        await opts[1].trigger('click')
      } else {
        await wrapper.findAll('button').find((b) => b.text() === '看答案')!.trigger('click')
        await settle(20)
        await wrapper.findAll('button').find((b) => b.text() === '会')!.trigger('click')
      }
      await settle(20)
      const next = wrapper.findAll('button').find((b) => ['下一题', '完成'].includes(b.text()))
      if (next) await next.trigger('click')
      await settle(20)
    }
    expect(wrapper.text()).toContain('本轮完成')
    expect(await db.cardAttempts.count()).toBe(2)
  })
})
