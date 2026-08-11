/**
 * 内容网络层：替代网页版的 fetch(`${BASE}content/...`)。
 *
 * - 内容源：imback.icu（EdgeOne Pages，同步自管线 content/）。
 * - 离线语义对齐网页版 SW 的 NetworkFirst：请求成功 → 写 storage 缓存；
 *   请求失败 → 回退到最近一次缓存；两者都没有才抛错（调用方按现状优雅降级）。
 */

/** 内容服务器根（不带尾斜杠）；备案未完成时开发工具需勾选"不校验合法域名" */
export const CONTENT_BASE = 'https://imback.icu/content'

const CACHE_PREFIX = 'cache:'

function readCache<T>(url: string): T | undefined {
  try {
    const raw = uni.getStorageSync(CACHE_PREFIX + url)
    if (typeof raw === 'string' && raw) return JSON.parse(raw) as T
  } catch {
    /* 缓存损坏按无缓存处理 */
  }
  return undefined
}

function writeCache(url: string, data: unknown): void {
  try {
    uni.setStorageSync(CACHE_PREFIX + url, JSON.stringify(data))
  } catch (e) {
    console.error('[content] 缓存写入失败', url, e)
  }
}

function requestJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      timeout: 15000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T)
        else reject(new Error(`${url} ${res.statusCode}`))
      },
      fail: () => reject(new Error(`${url} 网络错误`))
    })
  })
}

/**
 * 与网页版 fetchJson 同语义：成功返回 JSON，失败抛错。
 * 区别：网络失败但本地有缓存时返回缓存（离线可用）。
 */
export async function fetchJson<T>(path: string): Promise<T> {
  const url = `${CONTENT_BASE}/${path.replace(/^\//, '')}`
  try {
    const data = await requestJson<T>(url)
    writeCache(url, data)
    return data
  } catch (e) {
    const cached = readCache<T>(url)
    if (cached !== undefined) return cached
    throw e
  }
}
