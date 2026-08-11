import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, todayStr, type PracticeLog, type PracticeQtype } from '@/db'
import { getSetting } from '@/db/seed'
import { leastPracticedQtype, qtypeCounts, PRACTICE_QTYPES } from '@shared/recommend'

export interface PracticeInput {
  qtype: PracticeQtype
  materialRef?: string
  content?: string
  score?: number
  feedback?: string
}

/** 小程序 uni.request 版 POST JSON（替代网页版 fetch） */
function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      timeout: 30000,
      header: headers,
      data: body as never,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data)
        else reject(new Error(`批改接口 ${res.statusCode}`))
      },
      fail: () => reject(new Error('批改接口 网络错误'))
    })
  })
}

export const usePracticeStore = defineStore('practice', () => {
  const logs = ref<PracticeLog[]>([])

  async function load() {
    logs.value = await db.practiceLogs.toArray()
  }

  async function record(input: PracticeInput): Promise<void> {
    const entry: PracticeLog = { ...input, date: todayStr() }
    const id = await db.practiceLogs.add(entry)
    logs.value.push({ ...entry, id })
  }

  const counts = computed(() => qtypeCounts(logs.value))
  const recommendQtype = computed(() => leastPracticedQtype(logs.value))
  const total14 = computed(() => PRACTICE_QTYPES.reduce((s, q) => s + counts.value[q], 0))

  /**
   * 可选大模型批改：调用用户配置的 OpenAI 兼容接口。
   * 未配置则返回 null（前端走"对照参考自评"）。
   * 注：key 存本地 settings。
   */
  async function grade(qtype: string, prompt: string, answer: string, reference: string): Promise<string | null> {
    const base = (await getSetting('gradeApiBase', '')) as string
    const key = (await getSetting('gradeApiKey', '')) as string
    if (!base || !key) return null
    const sys = `你是新闻实务教研员，按${qtype}写作标准批改学生习作，给出 1~100 分与 3 条具体修改建议。只评价给定内容。`
    const user = `题目：${prompt}\n参考：${reference}\n学生习作：${answer}`
    const data = (await postJson(
      `${base.replace(/\/$/, '')}/chat/completions`,
      { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      {
        model: (await getSetting('gradeApiModel', 'gpt-4o-mini')) as string,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ],
        temperature: 0.3
      }
    )) as { choices?: { message?: { content?: string } }[] }
    return data?.choices?.[0]?.message?.content ?? null
  }

  return { logs, counts, recommendQtype, total14, load, record, grade }
})
