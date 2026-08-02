import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, todayStr, type CardAttempt, type CardMode, type CardState, type SelfGrade } from '@/db'
import { applyResult } from '@/core/cards'

/**
 * 刷题卡片 store（随心练习/系统复习共用数据层）。
 * 卡片静态 JSON 由管线产出（content/cards/），同源托管按需加载；
 * 答题记录与掌握状态存本地 IndexedDB（db v3），离线可用。
 */

const BASE = import.meta.env.BASE_URL

export type CardKind = 'single' | 'multi' | 'fill' | 'judge' | 'correct' | 'qa'

export interface Card {
  id: string
  kind: CardKind
  stem: string
  options?: Record<string, string>
  answer: string
  analysis: string
  tags: string[]
  source: {
    institution: string // 新华社/总台/人民日报/时政押题
    doc: string
    year?: number
    reliability: string // 回忆版/真题合集/机构模拟/机构题库/押题
  }
}

export interface CardsIndexEntry {
  key: string
  institution: string
  doc: string
  count: number
  reliability: string
  tags: string[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return (await r.json()) as T
}

export const useCardsStore = defineStore('cards', () => {
  const index = ref<CardsIndexEntry[]>([])
  const decks = ref<Map<string, Card[]>>(new Map())
  const states = ref<Map<string, CardState>>(new Map())
  const loading = ref(false)

  /** 卡片清单；文件缺失（旧部署）优雅降级为空 */
  async function loadIndex(): Promise<void> {
    try {
      index.value = await fetchJson<CardsIndexEntry[]>(`${BASE}content/cards/index.json`)
    } catch {
      index.value = []
    }
  }

  /** 按需加载某个来源的卡片，已加载走缓存 */
  async function loadDeck(key: string): Promise<Card[]> {
    const hit = decks.value.get(key)
    if (hit) return hit
    try {
      const cards = await fetchJson<Card[]>(`${BASE}content/cards/cards-${key}.json`)
      decks.value.set(key, cards)
      return cards
    } catch {
      decks.value.set(key, [])
      return []
    }
  }

  /** 加载全部卡（随心练习跨机构随机时用）；逐 deck 失败不拖垮整体 */
  async function loadAll(): Promise<Card[]> {
    const out: Card[] = []
    for (const e of index.value) out.push(...(await loadDeck(e.key)))
    return out
  }

  async function loadStates(): Promise<void> {
    const all = await db.cardStates.toArray()
    states.value = new Map(all.map((s) => [s.cardId, s]))
  }

  /** 记录一次答题：写 attempt + 累计 state（含 SRS 调度），本地缓存同步 */
  async function recordAttempt(
    card: Card,
    mode: CardMode,
    correct: boolean,
    selfGrade?: SelfGrade
  ): Promise<void> {
    const at = Date.now()
    const attempt: CardAttempt = { cardId: card.id, date: todayStr(), mode, correct, selfGrade, at }
    // 缓存取出的是 Vue 响应式 Proxy，展开为纯对象再累计，否则 IndexedDB 无法克隆
    const prev = states.value.get(card.id)
    const outcome = correct ? 'correct' : selfGrade === 'vague' ? 'vague' : 'wrong'
    const next = applyResult(prev ? { ...prev } : undefined, card.id, outcome, at, todayStr())
    await db.transaction('rw', db.cardAttempts, db.cardStates, async () => {
      await db.cardAttempts.add(attempt)
      await db.cardStates.put(next)
    })
    states.value.set(card.id, next)
  }

  return { index, decks, states, loading, loadIndex, loadDeck, loadAll, loadStates, recordAttempt }
})
