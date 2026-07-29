import type { Subject, Task } from '@/db'

/**
 * 任务生成（构建框架.md §7.1）。
 *
 * 阶段 1：最简版——手动维护今日任务即可。
 * 这里提供一个启动模板（首次启动若当日无任务则填充），可手动勾选/增删。
 *
 * §7.1 完整算法（周目标 ÷ 剩余天数、按 1/正确率 加权、<65% 板块 ×1.5）
 * 依赖 stats，将在阶段 2 补全（见 planByAccuracy）。
 */

export interface NewTask {
  subject: Subject
  title: string
  meta?: string
}

/** 阶段1 启动模板（与原型今日页示例对齐） */
export function starterTemplate(): NewTask[] {
  return [
    { subject: 'xc', title: '言语理解 · 刷题 20 道', meta: '建议正确率 ≥80%' },
    { subject: 'xc', title: '资料分析 · 2 篇', meta: '掐表完成' },
    { subject: 'sl', title: '申论 · 复习到期案例', meta: '遗忘曲线复习' },
    { subject: 'sl', title: '申论 · 阅读今日时评', meta: '约 5 分钟' },
    { subject: 'sw', title: '实务 · 每日消息写作', meta: '根据今日素材写 300 字消息' },
    { subject: 'sw', title: '实务 · 时政配套练习', meta: '月度统计配套题' }
  ]
}

/** 把模板固化为带 date/status 的 Task（未完成） */
export function materializeTasks(date: string, template: NewTask[]): Task[] {
  return template.map((t) => ({
    date,
    subject: t.subject,
    title: t.title,
    meta: t.meta,
    status: 'todo'
  }))
}
