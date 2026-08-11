/**
 * 小程序端数据层：替代网页版的 Dexie/IndexedDB。
 *
 * 设计：每张表 = 内存数组 + 整体序列化到 uni.storage（key: bear:<表名>），
 * 写入防抖持久化。学习记录数据量极小（最大 cardAttempts 每题一条），
 * 全量内存操作无性能问题；API 形状对齐网页版用到的 Dexie 子集，
 * 让 store 层迁移改动最小。
 *
 * 类型与日期工具直接从网页版共享代码（@shared → app/src/core）重导出。
 */

export * from '@shared/types'
export { todayStr, addDays, parseDate } from '@shared/dates'

type AnyRecord = Record<string, unknown>

const FLUSH_DELAY = 300

class MiniTable<T extends AnyRecord> {
  private items: T[] = []
  private loaded = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private name: string,
    // 主键字段名；undefined = 自增数字 id（对应 Dexie '++id'）
    private keyPath?: string
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = uni.getStorageSync(`bear:${this.name}`)
      if (typeof raw === 'string' && raw) this.items = JSON.parse(raw) as T[]
      else if (Array.isArray(raw)) this.items = raw as T[]
    } catch {
      this.items = []
    }
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      try {
        uni.setStorageSync(`bear:${this.name}`, JSON.stringify(this.items))
      } catch (e) {
        console.error(`[db] 持久化失败 bear:${this.name}`, e)
      }
    }, FLUSH_DELAY)
  }

  private nextId(): number {
    let max = 0
    for (const it of this.items) {
      const id = it.id as number | undefined
      if (typeof id === 'number' && id > max) max = id
    }
    return max + 1
  }

  private findIndex(key: unknown): number {
    if (!this.keyPath) return this.items.findIndex((it) => it.id === key)
    return this.items.findIndex((it) => it[this.keyPath!] === key)
  }

  async toArray(): Promise<T[]> {
    await this.ensureLoaded()
    return [...this.items]
  }

  async count(): Promise<number> {
    await this.ensureLoaded()
    return this.items.length
  }

  async get(key: unknown): Promise<T | undefined> {
    await this.ensureLoaded()
    const i = this.findIndex(key)
    return i >= 0 ? this.items[i] : undefined
  }

  async put(item: T): Promise<unknown> {
    await this.ensureLoaded()
    const key = this.keyPath ? item[this.keyPath] : item.id
    const i = this.findIndex(key)
    if (i >= 0) this.items[i] = item
    else this.items.push(item)
    this.scheduleFlush()
    return key
  }

  async bulkPut(items: T[]): Promise<void> {
    for (const it of items) await this.put(it)
  }

  async add(item: T): Promise<number> {
    await this.ensureLoaded()
    if (item.id === undefined) item.id = this.nextId()
    this.items.push(item)
    this.scheduleFlush()
    return item.id as number
  }

  async bulkAdd(items: T[]): Promise<void> {
    for (const it of items) await this.add(it)
  }

  async update(key: unknown, changes: Partial<T>): Promise<void> {
    await this.ensureLoaded()
    const i = this.findIndex(key)
    if (i >= 0) {
      this.items[i] = { ...this.items[i], ...changes }
      this.scheduleFlush()
    }
  }

  async delete(key: unknown): Promise<void> {
    await this.ensureLoaded()
    const i = this.findIndex(key)
    if (i >= 0) {
      this.items.splice(i, 1)
      this.scheduleFlush()
    }
  }

  async clear(): Promise<void> {
    await this.ensureLoaded()
    this.items = []
    this.scheduleFlush()
  }

  /** Dexie where().equals()/startsWith() 的最小实现（数据量小，全表扫描） */
  where(field: string) {
    const self = this
    return {
      equals(value: unknown) {
        return {
          async toArray(): Promise<T[]> {
            await self.ensureLoaded()
            return self.items.filter((it) => it[field] === value)
          }
        }
      },
      startsWith(prefix: string) {
        return {
          async toArray(): Promise<T[]> {
            await self.ensureLoaded()
            return self.items.filter(
              (it) => typeof it[field] === 'string' && (it[field] as string).startsWith(prefix)
            )
          }
        }
      }
    }
  }

  orderBy(field: string) {
    const self = this
    return {
      async last(): Promise<T | undefined> {
        await self.ensureLoaded()
        if (!self.items.length) return undefined
        return [...self.items].sort((a, b) => ((a[field] as number) ?? 0) - ((b[field] as number) ?? 0))[
          self.items.length - 1
        ]
      }
    }
  }
}

class PrepDB {
  tasks = new MiniTable('tasks')
  checkins = new MiniTable('checkins', 'date')
  quizLogs = new MiniTable('quizLogs')
  materials = new MiniTable('materials')
  reviews = new MiniTable('reviews')
  practiceLogs = new MiniTable('practiceLogs')
  settings = new MiniTable('settings', 'key')
  courses = new MiniTable('courses')
  cardAttempts = new MiniTable('cardAttempts')
  cardStates = new MiniTable('cardStates', 'cardId')

  /**
   * 对齐 Dexie transaction 签名：transaction('rw', table1, table2, fn)。
   * 内存实现天然一致，直接执行 fn（参数中的表仅作签名兼容）。
   */
  async transaction(_mode: string, ...args: unknown[]): Promise<unknown> {
    const fn = args[args.length - 1] as () => Promise<unknown> | unknown
    return await fn()
  }
}

export const db = new PrepDB()
