import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, type Course } from '@/db'

/**
 * 刷课进度 store（行测学习入门阶段）。
 * 课程清单：每门课记录总课时/已完成课时。
 */
export const useCourseStore = defineStore('course', () => {
  const courses = ref<Course[]>([])

  async function load() {
    courses.value = (await db.courses.toArray()).sort((a, b) => a.createdAt - b.createdAt)
  }

  async function add(name: string, totalLessons: number) {
    const c: Course = {
      name: name.trim(),
      totalLessons: Math.max(1, Math.floor(totalLessons)),
      doneLessons: 0,
      createdAt: Date.now()
    }
    const id = await db.courses.add(c)
    courses.value.push({ ...c, id })
  }

  /** 改名 / 改总课时；总课时调小时把已完成课时压回上限 */
  async function update(id: number, patch: { name?: string; totalLessons?: number }) {
    const c = courses.value.find((x) => x.id === id)
    if (!c) return
    if (patch.name != null) c.name = patch.name.trim() || c.name
    if (patch.totalLessons != null) {
      c.totalLessons = Math.max(1, Math.floor(patch.totalLessons))
      if (c.doneLessons > c.totalLessons) c.doneLessons = c.totalLessons
    }
    await db.courses.update(id, {
      name: c.name,
      totalLessons: c.totalLessons,
      doneLessons: c.doneLessons
    })
  }

  /** +1 课时，不超过总课时 */
  async function incrementDone(id: number) {
    const c = courses.value.find((x) => x.id === id)
    if (!c || c.doneLessons >= c.totalLessons) return
    c.doneLessons += 1
    await db.courses.update(id, { doneLessons: c.doneLessons })
  }

  /** -1 课时，不低于 0 */
  async function decrementDone(id: number) {
    const c = courses.value.find((x) => x.id === id)
    if (!c || c.doneLessons <= 0) return
    c.doneLessons -= 1
    await db.courses.update(id, { doneLessons: c.doneLessons })
  }

  async function remove(id: number) {
    await db.courses.delete(id)
    courses.value = courses.value.filter((x) => x.id !== id)
  }

  /** 单课进度 0~1 */
  function pctOf(c: Course): number {
    return c.totalLessons === 0 ? 0 : c.doneLessons / c.totalLessons
  }

  /** 整体进度：全部课程课时加权 */
  const overall = computed(() => {
    const total = courses.value.reduce((a, c) => a + c.totalLessons, 0)
    const done = courses.value.reduce((a, c) => a + c.doneLessons, 0)
    return { total, done, pct: total === 0 ? 0 : done / total }
  })

  return { courses, load, add, update, incrementDone, decrementDone, remove, pctOf, overall }
})
