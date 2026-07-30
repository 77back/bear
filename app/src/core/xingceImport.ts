import type { QuizModule } from '@/db'
import { todayStr } from '@/db'
import { QUIZ_MODULES } from './stats'

/**
 * 刷题记录「粘贴文本批量导入」解析器。纯函数，不碰 DOM/DB。
 *
 * 每行一条记录：
 *   [日期] 板块 总题数 正确数 [用时分钟] [薄弱标签...]
 * 例：
 *   资料分析 20 15 25 增长率
 *   判断推理,30,24
 *   2026-07-29 言语 40 32
 * - 分隔符容忍空格/制表符/中英文逗号/顿号，连续多个视为一个
 * - 板块支持别名（如 资料分析→资料），入库统一为 QUIZ_MODULES 规范名
 * - 无日期前缀默认今天；用时单位为分钟，入库换算为秒
 * - 任何一行解析失败都进 errors（带 1 起始行号与原因），空行跳过，绝不静默吞错
 */

/** 板块别名 → 规范模块名（与 core/stats.ts 的 QUIZ_MODULES 对齐） */
const MODULE_ALIAS: Record<string, QuizModule> = {
  言语: '言语',
  言语理解: '言语',
  言语理解与表达: '言语',
  判断: '判断',
  判断推理: '判断',
  数量: '数量',
  数量关系: '数量',
  资料: '资料',
  资料分析: '资料',
  常识: '常识',
  常识判断: '常识'
}

export interface ImportRecord {
  date: string // 'YYYY-MM-DD'
  module: QuizModule
  total: number
  correct: number
  seconds?: number
  weakPoints?: string[]
}

export interface ImportError {
  line: number // 1 起始行号
  text: string // 原始行内容
  reason: string
}

export interface ImportResult {
  records: ImportRecord[]
  errors: ImportError[]
}

const SEP = /[\s,，、]+/
const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
const INT_RE = /^\d+$/

export function parseQuizImport(text: string, today: string = todayStr()): ImportResult {
  const records: ImportRecord[] = []
  const errors: ImportError[] = []

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1
    const lineText = raw.trim()
    if (!lineText) return // 空行跳过
    const fail = (reason: string) => errors.push({ line, text: lineText, reason })

    const tokens = lineText.split(SEP).filter(Boolean)
    let i = 0

    // 可选日期前缀
    let date = today
    const dm = tokens[0]?.match(DATE_RE)
    if (dm) {
      const [, y, m, d] = dm
      if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) {
        fail(`日期无效「${tokens[0]}」`)
        return
      }
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      i = 1
    }

    // 板块
    const modToken = tokens[i]
    if (!modToken) {
      fail('缺少板块名')
      return
    }
    const module = MODULE_ALIAS[modToken]
    if (!module) {
      fail(`未知板块「${modToken}」（支持：${QUIZ_MODULES.join('、')}）`)
      return
    }

    // 总题数
    const totalToken = tokens[i + 1]
    if (totalToken == null) {
      fail('缺少总题数')
      return
    }
    if (!INT_RE.test(totalToken) || Number(totalToken) < 1) {
      fail(`总题数无效「${totalToken}」（需为正整数）`)
      return
    }
    const total = Number(totalToken)

    // 正确数
    const correctToken = tokens[i + 2]
    if (correctToken == null) {
      fail('缺少正确数')
      return
    }
    if (!INT_RE.test(correctToken)) {
      fail(`正确数无效「${correctToken}」（需为非负整数）`)
      return
    }
    const correct = Number(correctToken)
    if (correct > total) {
      fail(`正确数 ${correct} 超过总题数 ${total}`)
      return
    }

    // 可选用时（分钟）→ 秒
    let seconds: number | undefined
    let j = i + 3
    const minToken = tokens[j]
    if (minToken != null && INT_RE.test(minToken)) {
      seconds = Number(minToken) * 60
      j += 1
    }

    // 剩余 token 全部视为薄弱标签
    const weakPoints = tokens.slice(j)

    records.push({
      date,
      module,
      total,
      correct,
      seconds,
      weakPoints: weakPoints.length ? weakPoints : undefined
    })
  })

  return { records, errors }
}
