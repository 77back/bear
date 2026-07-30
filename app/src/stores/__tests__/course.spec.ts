import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCourseStore } from '../course'
import { db } from '@/db'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('course store（刷课进度）', () => {
  it('load 后为空；add 写入 courses 表并出现在列表', async () => {
    const s = useCourseStore()
    await s.load()
    expect(s.courses).toEqual([])

    await s.add('资料分析系统课', 24)
    expect(s.courses.length).toBe(1)
    expect(s.courses[0]).toMatchObject({ name: '资料分析系统课', totalLessons: 24, doneLessons: 0 })
    expect((await db.courses.toArray()).length).toBe(1)
  })

  it('incrementDone +1 且不越界（不超过总课时），decrementDone 不低于 0', async () => {
    const s = useCourseStore()
    await s.load()
    await s.add('判断推理', 2)
    const id = s.courses[0].id!

    await s.incrementDone(id)
    await s.incrementDone(id)
    await s.incrementDone(id) // 到顶后不再增加
    expect(s.courses[0].doneLessons).toBe(2)

    await s.decrementDone(id)
    expect(s.courses[0].doneLessons).toBe(1)
    await s.decrementDone(id)
    await s.decrementDone(id) // 到底后不再减少
    expect(s.courses[0].doneLessons).toBe(0)

    // 持久化一致
    const row = await db.courses.get(id)
    expect(row?.doneLessons).toBe(0)
  })

  it('update 改名/总课时；总课时调小时 doneLessons 压回上限', async () => {
    const s = useCourseStore()
    await s.load()
    await s.add('数量关系', 30)
    const id = s.courses[0].id!
    for (let i = 0; i < 10; i++) await s.incrementDone(id)

    await s.update(id, { name: '数量关系（高照）', totalLessons: 8 })
    expect(s.courses[0]).toMatchObject({ name: '数量关系（高照）', totalLessons: 8, doneLessons: 8 })

    const row = await db.courses.get(id)
    expect(row?.name).toBe('数量关系（高照）')
    expect(row?.doneLessons).toBe(8)
  })

  it('remove 删除课程并同步 DB', async () => {
    const s = useCourseStore()
    await s.load()
    await s.add('言语理解', 20)
    const id = s.courses[0].id!
    await s.remove(id)
    expect(s.courses).toEqual([])
    expect(await db.courses.get(id)).toBeUndefined()
  })

  it('进度派生：pctOf 单课 0~1，overall 课时加权', async () => {
    const s = useCourseStore()
    await s.load()
    await s.add('资料', 20) // 完成 10 → 50%
    await s.add('判断', 10) // 完成 5 → 50%
    const [a, b] = s.courses
    for (let i = 0; i < 10; i++) await s.incrementDone(a.id!)
    for (let i = 0; i < 5; i++) await s.incrementDone(b.id!)

    expect(s.pctOf(s.courses[0])).toBe(0.5)
    expect(s.pctOf(s.courses[1])).toBe(0.5)
    expect(s.overall).toEqual({ total: 30, done: 15, pct: 0.5 })
  })

  it('持久化：新 store 实例 load 后数据仍在', async () => {
    const s1 = useCourseStore()
    await s1.load()
    await s1.add('常识判断', 12)
    await s1.incrementDone(s1.courses[0].id!)

    // 模拟重启：换 pinia 后重新 load
    setActivePinia(createPinia())
    const s2 = useCourseStore()
    await s2.load()
    expect(s2.courses.length).toBe(1)
    expect(s2.courses[0]).toMatchObject({ name: '常识判断', totalLessons: 12, doneLessons: 1 })
  })
})
