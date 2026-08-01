import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import XingceView from '../XingceView.vue'
import { useStatsStore } from '@/stores/stats'
import { db, todayStr } from '@/db'

function settle(ms = 80) {
  // 让 onMounted 里的 async（store.load）跑完
  return new Promise((r) => setTimeout(r, ms))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
}

function mountView() {
  // jsdom 无 canvas，趋势图组件打桩
  return mount(XingceView, {
    global: { plugins: [makeRouter()], stubs: { EChart: true } }
  })
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await db.quizLogs.clear()
  await db.courses.clear()
})

describe('XingceView 统计概览', () => {
  it('无数据时显示本周刷题 0/目标、总题量 0、正确率占位，趋势区显示空态文案', async () => {
    const wrapper = mountView()
    await settle()

    const text = wrapper.text()
    expect(text).toContain('统计概览')
    expect(text).toContain('本周刷题')
    expect(text).toContain('总题量')
    expect(text).toContain('正确率')
    expect(text).toContain('录入刷题后显示趋势曲线')

    const store = useStatsStore()
    const items = wrapper.findAll('.ov-item')
    expect(items.length).toBe(3)
    expect(items[0].text()).toContain(`0/${store.weeklyGoal}`)
    expect(items[1].text()).toContain('0')
    expect(items[2].text()).toContain('—')
  })

  it('有记录时显示本周进度/总题量/正确率，展开「本周明细」显示记录行', async () => {
    await db.quizLogs.add({ date: todayStr(), module: '资料', total: 20, correct: 15 })
    const wrapper = mountView()
    await settle()

    const store = useStatsStore()
    expect(store.weekDone).toBe(20)

    const items = wrapper.findAll('.ov-item')
    expect(items[0].text()).toContain(`20/${store.weeklyGoal}`)
    expect(items[1].text()).toContain('20')
    expect(items[2].text()).toContain('75%')

    // 展开本周明细
    const detailBtn = wrapper.findAll('button').find((b) => b.text() === '本周明细')!
    await detailBtn.trigger('click')
    const lines = wrapper.findAll('.stat-line')
    expect(lines.length).toBe(1)
    expect(lines[0].text()).toContain('资料')
    expect(lines[0].text()).toContain('15/20 · 75%')
  })
})
