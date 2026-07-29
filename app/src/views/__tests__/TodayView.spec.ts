import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import TodayView from '../TodayView.vue'

function settle(ms = 80) {
  // 让 onMounted 里的 async（getSetting / store.load）跑完
  return new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('TodayView 渲染（阶段1 冒烟）', () => {
  it('挂载成功，渲染 hero / 今日任务 / 6 条任务行 / 打卡按钮 / 日历', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }]
    })
    const wrapper = mount(TodayView, { global: { plugins: [router] } })
    await settle()

    const text = wrapper.text()
    expect(text).toContain('早安')
    expect(text).toContain('距考试还有')
    expect(text).toContain('今日任务')
    expect(text).toContain('完成全部任务，点击打卡')
    expect(wrapper.findAll('.task-row').length).toBe(6)
    expect(wrapper.findAll('.cal-cell.head').length).toBe(7) // 周一~周日
  })

  it('勾选第一条任务 → 进度从 0/6 变 1/6，且该行置 done', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }]
    })
    const wrapper = mount(TodayView, { global: { plugins: [router] } })
    await settle()
    expect(wrapper.text()).toContain('0/6')

    await wrapper.findAll('.task-row')[0].trigger('click')
    await settle(20)
    expect(wrapper.text()).toContain('1/6')
    expect(wrapper.findAll('.task-row.done').length).toBe(1)
  })
})
