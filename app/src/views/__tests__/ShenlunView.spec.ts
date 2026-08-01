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

describe('ShenlunView 每日一文（结构拆解绑定真实文章）', () => {
  it('article 为空 → 不渲染任何结构卡（通用模板已移除），页面其余卡片兜底', async () => {
    mockDaily({ ...PKG_BASE, article: { title: '', url: '', structure: [], quotes: [], source: '' } })
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).not.toContain('每日一文')
    expect(text).not.toContain('文章结构推荐')
    expect(text).not.toContain('五段三分式') // 通用模板不再展示
    expect(text).toContain('每日案例推荐') // 其余卡片仍在，页面不空
  })

  it('有 article + outline → 渲染标题、领域、来源、查看原文与逐段 role/gist', async () => {
    mockDaily({
      ...PKG_BASE,
      article: {
        title: '把群众小事当成大事来办',
        url: 'https://example.com/a1',
        structure: [],
        outline: [
          { role: '引论·现象切入', gist: '从社区小事切入，引出基层治理主题' },
          { role: '分论点·政策维度', gist: '政策供给要精准对接群众需求' },
          { role: '结尾·升华', gist: '把小事办成大事，彰显治理温度' }
        ],
        quotes: ['民生无小事'],
        domain: '基层治理',
        source: '人民日报'
      }
    })
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('每日一文')
    expect(text).toContain('把群众小事当成大事来办')
    expect(text).toContain('基层治理')
    expect(text).toContain('人民日报')
    expect(text).toContain('查看原文')
    expect(text).toContain('引论·现象切入')
    expect(text).toContain('从社区小事切入，引出基层治理主题')
    expect(text).toContain('分论点·政策维度')
    expect(text).toContain('结尾·升华')
    expect(text).toContain('收藏进素材库')
    expect(text).not.toContain('文章结构推荐')

    const link = wrapper.find('a[href="https://example.com/a1"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('target')).toBe('_blank')
  })

  it('outline 为空（旧包/降级）→ 卡片仍显示标题来源，但不渲染逐段列表', async () => {
    mockDaily({
      ...PKG_BASE,
      article: { title: '算法不能算计', url: '', structure: [], quotes: [], domain: '科技创新', source: '新华社' }
    })
    const wrapper = mount(ShenlunView, { global: { plugins: [makeRouter()] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('每日一文')
    expect(text).toContain('算法不能算计')
    expect(text).toContain('科技创新')
    expect(text).toContain('新华社')
    expect(text).not.toContain('查看原文') // 无 url → 链接不渲染
    expect(text).not.toContain('引论')
    expect(text).toContain('收藏进素材库')
  })
})
