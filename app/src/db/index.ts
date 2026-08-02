import Dexie, { type Table } from 'dexie'

/**
 * 数据模型（构建框架.md §六）。
 * 全部学习数据本地 IndexedDB，离线可用。
 */

export type Subject = 'xc' | 'sl' | 'sw' // 行测 / 申论 / 实务
export type TaskStatus = 'todo' | 'done'

export interface Task {
  id?: number
  date: string // 'YYYY-MM-DD'
  subject: Subject
  title: string
  meta?: string
  status: TaskStatus
  doneAt?: number
}

export interface Checkin {
  date: string // 主键 'YYYY-MM-DD'
  doneCount: number
  totalCount: number
  streak: number
}

// 行测五板块
export type QuizModule = '言语' | '判断' | '数量' | '资料' | '常识'

export interface QuizLog {
  id?: number
  date: string // 'YYYY-MM-DD'
  module: QuizModule
  total: number
  correct: number
  seconds?: number
  weakPoints?: string[]
}

export type MaterialType = 'case' | 'structure' | 'article' | 'pinglun'

export interface Material {
  id?: number
  type: MaterialType
  title: string
  body: string
  domains: string[]
  usage?: string
  source?: string
  collectedAt: number
  archived?: boolean // 非索引字段：复习全部走完 → 归档入案例库
}

// 复习阶段：0=收藏当日，后续 1/3/7/15 天
export type ReviewStage = 0 | 1 | 2 | 3 | 4

export interface Review {
  id?: number
  materialId: number
  stage: ReviewStage
  dueDate: string // 'YYYY-MM-DD'
  doneAt?: number
}

export type PracticeQtype = '消息' | '评论' | '策划' | '纠错' | '标题'

export interface PracticeLog {
  id?: number
  date: string
  qtype: PracticeQtype
  materialRef?: string
  content?: string
  score?: number
  feedback?: string
}

export interface Setting {
  key: string
  value: unknown
}

// 刷课进度（阶段：学习入门）：每门课记录总课时/已完成课时
export interface Course {
  id?: number
  name: string
  totalLessons: number
  doneLessons: number
  createdAt: number
}

// 刷题卡片答题记录（随心练习/系统复习共用，见 考点地图与命题库设计.md §六）
export type CardMode = 'casual' | 'review'
export type SelfGrade = 'know' | 'vague' | 'unknown'

export interface CardAttempt {
  id?: number
  cardId: string
  date: string // 'YYYY-MM-DD'
  mode: CardMode
  correct: boolean
  selfGrade?: SelfGrade // 翻卡自评（填空/改错/问答卡）；选择题无此字段
  at: number // 时间戳
}

// 每卡累计掌握状态（答题记录聚合；非索引字段扩展不需要 Dexie 升版本）
export interface CardState {
  cardId: string // 主键
  seen: number
  correctCount: number
  wrongCount: number
  streak: number // 连续答对次数
  mastered: boolean // 连续答对 ≥2 次 或 SRS 走完 4 阶段视为掌握
  lastAt: number
  // SRS 复习调度（第二波：系统化复习队列）：答错进入队列，stage 0→4 间隔 [1,3,7,15] 天
  srsStage?: number // 已成功复习次数；undefined = 从未进入复习循环
  dueDate?: string // 'YYYY-MM-DD' 下次到期日；undefined = 无待复习
}

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

/* ---------- 日期工具（纯函数，core 与 db 共用） ---------- */

/** 本地日期 'YYYY-MM-DD'，避免 UTC 偏移 */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 加/减若干天，返回新 Date */
export function addDays(base: Date, delta: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + delta)
  return d
}

/** 把 'YYYY-MM-DD' 解析为本地 Date（当天 00:00） */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
