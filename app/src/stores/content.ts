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
  domain?: string // 领域标签（旧内容包可能没有）
  source: string
  url?: string
}
export interface ArticleOutlineSeg {
  role: string // 该段在文中的作用（如「引论·现象切入」，形式自由）
  gist: string // 该段大意（≤120 字，管线已校验基于原文）
}
export interface ArticleItem {
  title: string
  url: string
  structure: string[]
  outline?: ArticleOutlineSeg[] // 逐段结构拆解（旧内容包可能没有）
  quotes: string[]
  domain?: string
  source: string
}
// 每日三件套（从当日申论文章提取；旧包/降级时为空对象）
export interface ShenlunTrio {
  sentence?: string
  title?: string
  case?: string
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
  shenlun?: ShenlunTrio
  shiwu: ShiwuPackage
  structure: StructureItem
  guoji: GuojiItem[]
}

// 案例归档（content/archive/cases.json，管线累积产出）
export interface ArchiveCase {
  id: string
  date: string
  domain: string
  title: string
  text: string
  source: string
  url?: string
}

// 领域清单（与管线 common.DOMAINS 一致，案例库筛选用）
export const CASE_DOMAINS = [
  '经济发展',
  '政务服务',
  '基层治理',
  '乡村振兴',
  '民生保障',
  '生态文明',
  '文化建设',
  '科技创新',
  '其他'
] as const

export interface ContentIndex {
  latest: string
  dates: string[]
}

export interface ShizhengItem {
  date?: string // 入库日期（旧月度文件可能没有）
  title: string
  points: string[]
  domains: string[]
  reading: string
  analysis?: string // 专家视角解读（旧加工产物可能没有）
  source: string
  url?: string
}
export interface ShizhengMonth {
  month: string
  items: ShizhengItem[]
}
// 每日纠错知识点（content/shiwu/knowledge.json，静态题库，按日轮换）
export interface KnowledgeItem {
  id: string
  point: string
  wrong: string
  right: string
  note: string
}
export interface PinglunEntry {
  id: string
  title: string
  month: string
  domains: string[]
  structure: string
  examUse: string | string[] // 管线产出两种形态都有
  source?: string
}
// 媒体备考板块（content/media/*.json，静态人工维护；文件缺失优雅降级为空数组）
export interface MediaOrg {
  id: string
  org: string // 机构名（新华社/人民日报/中央广播电视总台/光明日报/工人日报/经济日报/中国青年报/新华社河南分社/河南日报/河南电视台）
  point: string
  detail: string
  tag: string // '考过'（真题方向）或 '常识'
}
export interface MediaKnowledgeItem {
  id: string
  question: string
  answer: string
  domain?: string
  tag: string
}
export interface MediaPlan {
  id: string
  type: string // '采访策划' 或 '报道策划'
  topic: string
  title: string
  points: string[]
  note: string
}
export interface MediaReport {
  id: string
  title: string
  outline: string[]
  tips: string
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
  const dates = ref<string[]>([])
  const daily = ref<DailyPackage | null>(null)
  const loading = ref(false)
  const error = ref('')

  // 实务页：时政月统计 / 评论库
  const shizheng = ref<ShizhengMonth | null>(null)
  const pinglunIndex = ref<PinglunEntry[]>([])

  // 时政库：全部月份分区展示（shizheng/index.json 缺失时降级为当月）
  const shizhengMonths = ref<ShizhengMonth[]>([])

  // 每日纠错知识点（静态题库，线上旧部署可能没有 → 优雅降级为空数组）
  const knowledge = ref<KnowledgeItem[]>([])

  // 案例归档（线上旧部署可能没有该文件 → 优雅降级为空数组）
  const archive = ref<ArchiveCase[]>([])

  async function loadArchive(): Promise<void> {
    try {
      archive.value = await fetchJson<ArchiveCase[]>(`${BASE}content/archive/cases.json`)
    } catch {
      archive.value = []
    }
  }

  // 媒体备考：四个静态文件各自独立降级，缺哪个哪个为空数组
  const mediaOrgs = ref<MediaOrg[]>([])
  const mediaKnowledge = ref<MediaKnowledgeItem[]>([])
  const mediaPlans = ref<MediaPlan[]>([])
  const mediaReports = ref<MediaReport[]>([])

  async function loadMedia(): Promise<void> {
    try {
      mediaOrgs.value = await fetchJson<MediaOrg[]>(`${BASE}content/media/orgs.json`)
    } catch {
      mediaOrgs.value = []
    }
    try {
      mediaKnowledge.value = await fetchJson<MediaKnowledgeItem[]>(`${BASE}content/media/mediaKnowledge.json`)
    } catch {
      mediaKnowledge.value = []
    }
    try {
      mediaPlans.value = await fetchJson<MediaPlan[]>(`${BASE}content/media/plans.json`)
    } catch {
      mediaPlans.value = []
    }
    try {
      mediaReports.value = await fetchJson<MediaReport[]>(`${BASE}content/media/reports.json`)
    } catch {
      mediaReports.value = []
    }
  }

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

  async function fetchShizhengMonth(month: string): Promise<ShizhengMonth | null> {
    try {
      return await fetchJson<ShizhengMonth>(`${BASE}content/shizheng/${month}.json`)
    } catch {
      return null
    }
  }

  /** 时政库：读 index 的月份清单后逐月拉取；index 缺失降级为当月，单月文件缺失跳过 */
  async function loadShizhengAll(): Promise<void> {
    let months: string[] = []
    try {
      const idx = await fetchJson<{ months: string[] }>(`${BASE}content/shizheng/index.json`)
      months = Array.isArray(idx.months) ? idx.months : []
    } catch {
      months = [new Date().toISOString().slice(0, 7)]
    }
    const out: ShizhengMonth[] = []
    for (const m of [...months].sort().reverse()) {
      const data = await fetchShizhengMonth(m)
      if (data) out.push(data)
    }
    shizhengMonths.value = out
  }

  async function loadKnowledge(): Promise<void> {
    try {
      knowledge.value = await fetchJson<KnowledgeItem[]>(`${BASE}content/shiwu/knowledge.json`)
    } catch {
      knowledge.value = []
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
      dates.value = idx.dates
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

  /** 换一批：在 index.dates 中循环切换到下一个日期的内容包 */
  async function nextDaily(): Promise<void> {
    if (dates.value.length < 2) return
    const i = dates.value.indexOf(latest.value)
    const next = dates.value[(i + 1) % dates.value.length]
    const pkg = await fetchDaily(next)
    if (pkg) {
      daily.value = pkg
      latest.value = pkg.date
    }
  }

  return {
    latest,
    dates,
    daily,
    loading,
    error,
    shizheng,
    shizhengMonths,
    knowledge,
    pinglunIndex,
    archive,
    load,
    nextDaily,
    loadShizheng,
    loadShizhengAll,
    loadKnowledge,
    loadPinglunIndex,
    loadPinglunDetail,
    loadArchive,
    loadMedia,
    mediaOrgs,
    mediaKnowledge,
    mediaPlans,
    mediaReports
  }
})
