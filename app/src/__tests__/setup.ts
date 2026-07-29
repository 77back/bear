import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { db } from '@/db'

// 每个测试前清空所有表，保证隔离（schema 在首次打开时自动建立，幂等）
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})
