import { heatLevel, type HeatLevel } from './checkin'

/**
 * 打卡日历热力图（§7.2 热力图档位）。
 * 纯函数：输入年/月/每日完成率，输出周一开头的日历网格。
 */

export interface CalCell {
  day: number // 1~31
  date: string // 'YYYY-MM-DD'
  level: HeatLevel // 0=空/未学
  empty: boolean // 月前/月后占位
}

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

/** 周一开头的列偏移：getDay() 周日=0..周六=6 → 周一开头索引 */
function mondayIndex(dow: number): number {
  return dow === 0 ? 6 : dow - 1
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 构造某月日历矩阵（含月前空格补齐，便于直接渲染 cal-grid）。
 * @param year 如 2026
 * @param month 1~12
 * @param rateByDate 每日完成率 Map（key 'YYYY-MM-DD'）
 */
export function buildMonthCalendar(
  year: number,
  month: number,
  rateByDate: Map<string, number>
): CalCell[] {
  const cells: CalCell[] = []
  const firstDow = mondayIndex(new Date(year, month - 1, 1).getDay())
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: 0, date: '', level: 0, empty: true })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`
    const rate = rateByDate.get(date) ?? 0
    cells.push({ day: d, date, level: heatLevel(rate), empty: false })
  }
  // 补齐到 7 的倍数（完整周）
  while (cells.length % 7 !== 0) {
    cells.push({ day: 0, date: '', level: 0, empty: true })
  }
  return cells
}

export function weekHead(): string[] {
  return WEEK_HEAD
}
