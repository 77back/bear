import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 内容 store（阶段3）：读取管线产出的当日包（构建框架 §8.4）。
 * 同源托管：fetch `${BASE}content/...`；PWA SW 对 content/ 走 NetworkFirst，
 * 断网时回退到缓存 → 「断网打开 App 显示最近一次内容」。
 */

const BASE = import.meta.env.BASE_URL

export interface CaseItem {
  title: string
  summary: string
  themes: string[]
  usage: string
  source: string
  url?: string
}
export interface ArticleItem {
  title: string
  url: string
  structure: string[]
  quotes: string[]
  source: string
}
export interface ShiwuExercise {
  qtype: '消息' | '标题' | '纠错'
  prompt: string
  reference: string
}
export interface ShiwuPackage {
  material: { title: string; body: string; source: string; url?: string }
  exercises: ShiwuExercise[]
}
export interface StructureItem {
  name: string
  nodes: string[]
  fragment: string
}
export interface GuojiItem {
  title: string
  points: string[]
  reading: string
  source: string
  url?: string
}
export interface DailyPackage {
  date: string
  cases: CaseItem[]
  article: ArticleItem
  shiwu: ShiwuPackage
  structure: StructureItem
  guoji: GuojiItem[]
}

export interface ContentIndex {
  latest: string
  dates: string[]
}

export interface ShizhengItem {
  title: string
  points: string[]
  domains: string[]
  reading: string
  source: string
  url?: string
}
export interface ShizhengMonth {
  month: string
  items: ShizhengItem[]
}
export interface PinglunEntry {
  id: string
  title: string
  month: string
  domains: string[]
  structure: string
  examUse: string
  source?: string
}
export interface PinglunDetail {
  id: string
  title: string
  url: string
  structure: string[]
  methods: string[]
  quotes: string[]
  examUse: string
  source: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return (await r.json()) as T
}

export const useContentStore = defineStore('content', () => {
  const latest = ref('')
  const daily = ref<DailyPackage | null>(null)
  const loading = ref(false)
  const error = ref('')

  // 实务页：时政月统计 / 评论库
  const shizheng = ref<ShizhengMonth | null>(null)
  const pinglunIndex = ref<PinglunEntry[]>([])

  async function fetchDaily(date: string): Promise<DailyPackage | null> {
    try {
      return await fetchJson<DailyPackage>(`${BASE}content/daily/${date}.json`)
    } catch {
      return null
    }
  }

  async function loadShizheng(month: string): Promise<void> {
    try {
      shizheng.value = await fetchJson<ShizhengMonth>(`${BASE}content/shizheng/${month}.json`)
    } catch {
      shizheng.value = null
    }
  }

  async function loadPinglunIndex(): Promise<void> {
    try {
      pinglunIndex.value = await fetchJson<PinglunEntry[]>(`${BASE}content/pinglun/index.json`)
    } catch {
      pinglunIndex.value = []
    }
  }

  async function loadPinglunDetail(month: string, id: string): Promise<PinglunDetail | null> {
    try {
      return await fetchJson<PinglunDetail>(`${BASE}content/pinglun/${month}/${id}.json`)
    } catch {
      return null
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const idx = await fetchJson<ContentIndex>(`${BASE}content/index.json`)
      latest.value = idx.latest
      // 先取最新；失败则按 dates 回退到最近可用
      const pkg = (await fetchDaily(idx.latest)) ?? await fallback(idx.dates)
      daily.value = pkg
      if (pkg) latest.value = pkg.date
    } catch (e) {
      error.value = (e as Error).message
      daily.value = null
    } finally {
      loading.value = false
    }
  }

  async function fallback(dates: string[]): Promise<DailyPackage | null> {
    for (const d of dates) {
      const pkg = await fetchDaily(d)
      if (pkg) return pkg
    }
    return null
  }

  return {
    latest,
    daily,
    loading,
    error,
    shizheng,
    pinglunIndex,
    load,
    loadShizheng,
    loadPinglunIndex,
    loadPinglunDetail
  }
})
