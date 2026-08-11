import Dexie, { type Table } from 'dexie'
import type {
  Task,
  Checkin,
  QuizLog,
  Material,
  Review,
  PracticeLog,
  Setting,
  Course,
  CardAttempt,
  CardState
} from '../core/types'

/**
 * 数据模型（构建框架.md §六）。
 * 全部学习数据本地 IndexedDB，离线可用。
 * 类型定义已抽到 core/types.ts（小程序端共享），此处重导出保持原引用不变。
 */

export * from '../core/types'
export { todayStr, addDays, parseDate } from '../core/dates'

export class PrepDB extends Dexie {
  tasks!: Table<Task, number>
  checkins!: Table<Checkin, string>
  quizLogs!: Table<QuizLog, number>
  materials!: Table<Material, number>
  reviews!: Table<Review, number>
  practiceLogs!: Table<PracticeLog, number>
  settings!: Table<Setting, string>
  courses!: Table<Course, number>
  cardAttempts!: Table<CardAttempt, number>
  cardStates!: Table<CardState, string>

  constructor() {
    super('bear-prep')
    // 版本 1（见 §六）
    this.version(1).stores({
      tasks: '++id, date, status',
      checkins: 'date',
      quizLogs: '++id, date, module',
      materials: '++id, type, collectedAt, *domains',
      reviews: '++id, materialId, dueDate, stage',
      practiceLogs: '++id, date, qtype',
      settings: 'key'
    })
    // 版本 2：新增 courses（刷课进度），旧表原样保留，向后兼容
    this.version(2).stores({
      courses: '++id, createdAt'
    })
    // 版本 3：新增刷题卡片的答题记录与掌握状态
    this.version(3).stores({
      cardAttempts: '++id, cardId, date, mode',
      cardStates: 'cardId, lastAt'
    })
  }
}

export const db = new PrepDB()
