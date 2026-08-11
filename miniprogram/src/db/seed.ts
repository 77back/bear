import { db } from './index'

/**
 * 首次启动初始化（与网页版 db/seed.ts 行为一致）。幂等。
 */
export async function ensureSeed(): Promise<void> {
  const existing = await db.settings.count()
  if (existing > 0) return

  await db.settings.bulkPut([
    { key: 'examDate', value: '2026-11-27' },
    { key: 'weeklyGoal', value: 300 },
    { key: 'dailyMinutes', value: 120 },
    { key: 'nickname', value: '小熊' }
  ])
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
