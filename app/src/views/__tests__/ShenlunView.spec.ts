import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ShenlunView from '../ShenlunView.vue'
import type { DailyPackage } from '@/stores/content'

function settle(ms = 80) {
  // 让 onMounted 里的 async（review.load / content.load）跑完
  return new Promise((r) => setTimeout(r, ms))
}

const PKG_BASE: DailyPackage = {
  date: '2026-07-29',
  cases: [{ title: '林丹', summary: '社区', themes: ['基层治理'], usage: '用法', source: '求是网' }],
  article: { title: '时评', url: '', structure: [], quotes: [], source: '' },
  shiwu: { material: { title: '遥感卫星', body: '正文', source: '新华社' }, exercises: [] },
  structure: { name: '五段三分式', nodes: [], fragment: '' },
  guoji: []
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
}

function mockDaily(pkg: DailyPackage) {
  globalThis.fetch = vi.fn(async (url: string) => {
    if (url.includes('content/index.json'))
      return { ok: true, status: 200, json: async () => ({ latest: pkg.date, dates: [pkg.date] }) }
    if (url.includes(`content/daily/${pkg.date}.json`))
      return { ok: true, status: 200, json: async () => pkg }
    return { ok: false, status: 404, json: async () => ({}) }
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

describe('ShenlunView 每日三件套（显隐逻辑）', () => {
  it('daily.shenlun 有内容 → 三件套卡片显示好句子/好标题/好案例', async () => {
    mockDaily({
      ...PKG_BASE,
      shenlun: { sentence: '民生无小事，枝叶总关情', title: '把小事办成大事', case: '王磊返乡种猕猴桃' }
    })
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('每日三件套')
    expect(text).toContain('好句子')
    expect(text).toContain('民生无小事，枝叶总关情')
    expect(text).toContain('好标题')
    expect(text).toContain('把小事办成大事')
    expect(text).toContain('好案例')
    expect(text).toContain('王磊返乡种猕猴桃')
  })

  it('旧内容包无 shenlun 字段 → 整卡隐藏，页面其余正常', async () => {
    mockDaily(PKG_BASE)
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).not.toContain('每日三件套')
    expect(text).toContain('每日案例推荐') // 其余卡片不受影响
    expect(text).toContain('案例库') // 案例库入口仍在
  })

  it('shenlun 为空对象（降级产出）→ 整卡隐藏', async () => {
    mockDaily({ ...PKG_BASE, shenlun: {} })
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()
    expect(wrapper.text()).not.toContain('每日三件套')
  })
})
