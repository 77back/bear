import { db } from './index'

/**
 * 首次启动初始化（见 §四 db/seed.ts）。
 * 写入默认设置；已有则跳过。幂等。
 */
export async function ensureSeed(): Promise<void> {
  const existing = await db.settings.count()
  if (existing > 0) return

  await db.settings.bulkPut([
    // 原型示意：7月29日距考 121 天 → 2026-11-27
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
