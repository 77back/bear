/* ---------- 日期工具（纯函数，core 与两端 db 共用；原在 db/index.ts） ---------- */

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
