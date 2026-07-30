import { describe, it, expect } from 'vitest'
import { parseQuizImport } from '../xingceImport'

const TODAY = '2026-07-30'

describe('parseQuizImport 批量导入解析', () => {
  it('正常解析：板块 总数 正确 用时 薄弱标签', () => {
    const { records, errors } = parseQuizImport('资料分析 20 15 25 增长率', TODAY)
    expect(errors).toEqual([])
    expect(records).toEqual([
      {
        date: TODAY,
        module: '资料',
        total: 20,
        correct: 15,
        seconds: 1500, // 25 分钟 → 秒
        weakPoints: ['增长率']
      }
    ])
  })

  it('多种分隔符：空格 / 中英文逗号 / 顿号 / 制表符，连续分隔符视为一个', () => {
    const text = ['判断推理,30,24', '言语，40  32', '数量、10、6', '常识\t15\t9'].join('\n')
    const { records, errors } = parseQuizImport(text, TODAY)
    expect(errors).toEqual([])
    expect(records.map((r) => [r.module, r.total, r.correct])).toEqual([
      ['判断', 30, 24],
      ['言语', 40, 32],
      ['数量', 10, 6],
      ['常识', 15, 9]
    ])
  })

  it('板块别名归一：资料分析→资料、判断推理→判断、数量关系→数量、常识判断→常识', () => {
    const { records, errors } = parseQuizImport(
      '资料分析 20 15\n判断推理 20 15\n数量关系 20 15\n常识判断 20 15\n言语理解 20 15',
      TODAY
    )
    expect(errors).toEqual([])
    expect(records.map((r) => r.module)).toEqual(['资料', '判断', '数量', '常识', '言语'])
  })

  it('带日期前缀：用指定日期并规范化补零；无日期默认今天', () => {
    const { records, errors } = parseQuizImport('2026-7-9 资料 20 15\n资料 20 15', TODAY)
    expect(errors).toEqual([])
    expect(records[0].date).toBe('2026-07-09')
    expect(records[1].date).toBe(TODAY)
  })

  it('可选用时省略时，后续 token 直接视为薄弱标签', () => {
    const { records, errors } = parseQuizImport('言语 40 32 逻辑填空 实词辨析', TODAY)
    expect(errors).toEqual([])
    expect(records[0].seconds).toBeUndefined()
    expect(records[0].weakPoints).toEqual(['逻辑填空', '实词辨析'])
  })

  it('错误行：未知板块，带行号与原因', () => {
    const { records, errors } = parseQuizImport('资料 20 15\n申论 20 15', TODAY)
    expect(records.length).toBe(1)
    expect(errors.length).toBe(1)
    expect(errors[0].line).toBe(2)
    expect(errors[0].reason).toContain('未知板块')
    expect(errors[0].text).toBe('申论 20 15')
  })

  it('错误行：正确数 > 总题数', () => {
    const { records, errors } = parseQuizImport('资料 20 21', TODAY)
    expect(records).toEqual([])
    expect(errors[0].reason).toContain('超过总题数')
  })

  it('错误行：非数字 / 负数 / 小数的题数', () => {
    const { records, errors } = parseQuizImport('资料 abc 15\n资料 20 -1\n资料 20.5 15', TODAY)
    expect(records).toEqual([])
    expect(errors.length).toBe(3)
    expect(errors[0].reason).toContain('总题数无效')
    expect(errors[1].reason).toContain('正确数无效')
    expect(errors[2].reason).toContain('总题数无效')
  })

  it('错误行：缺字段与无效日期', () => {
    const { records, errors } = parseQuizImport('资料 20\n2026-13-40 资料 20 15', TODAY)
    expect(records).toEqual([])
    expect(errors.length).toBe(2)
    expect(errors[0].reason).toContain('缺少正确数')
    expect(errors[1].reason).toContain('日期无效')
  })

  it('空行与纯空白行跳过，不算错误', () => {
    const { records, errors } = parseQuizImport('资料 20 15\n\n   \n判断 30 24\n', TODAY)
    expect(errors).toEqual([])
    expect(records.length).toBe(2)
  })

  it('空文本：无记录无错误', () => {
    const { records, errors } = parseQuizImport('', TODAY)
    expect(records).toEqual([])
    expect(errors).toEqual([])
  })

  it('混合文本：成功与失败并存，互不吞掉', () => {
    const text = '资料 20 15\n错误行\n2026-07-29 言语 40 32 逻辑填空'
    const { records, errors } = parseQuizImport(text, TODAY)
    expect(records.length).toBe(2)
    expect(errors.length).toBe(1)
    expect(errors[0].line).toBe(2)
  })
})
