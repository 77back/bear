import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, todayStr, type Material, type MaterialType, type Review } from '@/db'
import { createReviews, dueReviews, stageBuckets } from '@/core/ebbinghaus'
import { useTaskStore } from './task'

/** 收藏入参（来自内容管线案例/文章，或手动） */
export interface CollectInput {
  type: MaterialType
  title: string
  body: string
  domains?: string[]
  usage?: string
  source?: string
}

export const useReviewStore = defineStore('review', () => {
  const materials = ref<Material[]>([])
  const reviews = ref<Review[]>([])
  const today = ref(todayStr())

  const due = computed(() => dueReviews(reviews.value, today.value))
  const dueCount = computed(() => due.value.length)
  const buckets = computed(() => stageBuckets(reviews.value, today.value))
  const collectedCount = computed(() => materials.value.length)

  /** 按素材 id 取详情 */
  function materialOf(id: number): Material | undefined {
    return materials.value.find((m) => m.id === id)
  }

  async function load() {
    today.value = todayStr()
    materials.value = await db.materials.toArray()
    reviews.value = await db.reviews.toArray()
    await syncTask()
  }

  /** 收藏素材 → 写 material + 生成 5 条 Review（艾宾浩斯） */
  async function collect(input: CollectInput): Promise<number> {
    const mat: Material = {
      type: input.type,
      title: input.title,
      body: input.body,
      domains: input.domains ?? [],
      usage: input.usage,
      source: input.source,
      collectedAt: Date.now()
    }
    const id = await db.materials.add(mat)
    materials.value.push({ ...mat, id })
    const newReviews = createReviews(id, mat.collectedAt)
    const ids = await db.reviews.bulkAdd(newReviews, { allKeys: true })
    reviews.value.push(...newReviews.map((rv, i) => ({ ...rv, id: ids[i] })))
    await syncTask()
    return id
  }

  /** 完成一次复习（标记 doneAt）→ 复习完成计入当日任务 */
  async function complete(reviewId: number) {
    const r = reviews.value.find((x) => x.id === reviewId)
    if (!r || r.doneAt) return
    r.doneAt = Date.now()
    await db.reviews.update(reviewId, { doneAt: r.doneAt })
    await syncTask()
  }

  async function removeMaterial(materialId: number) {
    await db.materials.delete(materialId)
    await db.reviews.where('materialId').equals(materialId).delete()
    materials.value = materials.value.filter((m) => m.id !== materialId)
    reviews.value = reviews.value.filter((r) => r.materialId !== materialId)
    await syncTask()
  }

  /** 与今日任务联动：有素材则确保复习任务存在；无待复习则置完成 */
  async function syncTask() {
    const task = useTaskStore()
    if (reviews.value.length > 0) {
      await task.ensureReviewTask()
      await task.setReviewTaskStatus(dueCount.value === 0)
    }
  }

  return {
    materials,
    reviews,
    today,
    due,
    dueCount,
    buckets,
    collectedCount,
    materialOf,
    load,
    collect,
    complete,
    removeMaterial
  }
})
