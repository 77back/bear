import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ImportPage from '../sub/ImportPage.vue'
import { db } from '@/db'

function settle(ms = 80) {
  // 让 onMounted / async 操作跑完
  return new Promise((r) => setTimeout(r, ms))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }]
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ImportPage 批量导入（交互）', () => {
  it('粘贴 → 解析预览显示成功/失败明细 → 确认写入 quizLogs', async () => {
    const wrapper = mount(ImportPage, { global: { plugins: [makeRouter()] } })

    await wrapper.find('textarea').setValue('资料分析 20 15 25 增长率\n判断 30 24\n申论 10 8')
    await wrapper.find('button').trigger('click') // 解析预览
    await settle(20)

    const text = wrapper.text()
    expect(text).toContain('解析成功 2 条')
    expect(text).toContain('失败 1 条')
    expect(text).toContain('第 3 行')
    expect(text).toContain('未知板块')

    // 确认导入
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认导入'))!
    await confirmBtn.trigger('click')
    await settle()

    const rows = await db.quizLogs.toArray()
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ module: '资料', total: 20, correct: 15, seconds: 1500 })
    expect(rows[0].weakPoints).toEqual(['增长率'])
    expect(rows[1]).toMatchObject({ module: '判断', total: 30, correct: 24 })
  })

  it('全部解析失败时确认按钮禁用，不写入', async () => {
    const wrapper = mount(ImportPage, { global: { plugins: [makeRouter()] } })

    await wrapper.find('textarea').setValue('这是一行错误文本')
    await wrapper.find('button').trigger('click')
    await settle(20)

    expect(wrapper.text()).toContain('失败 1 条')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认导入'))!
    expect(confirmBtn.attributes('disabled')).toBeDefined()
    expect((await db.quizLogs.toArray()).length).toBe(0)
  })
})
