/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

/** 构建标识：commit 短哈希 + 构建时间，注入全局 __BUILD_REV__，用于页面底部版本标识 */
function buildRev(): string {
  let hash = 'dev'
  try {
    hash = execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    /* 非 git 环境（如 CI 快照）退回纯时间戳 */
  }
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${hash} · ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_REV__: JSON.stringify(buildRev())
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        name: '备考打卡助手',
        short_name: '备考助手',
        description: '行测/申论/新闻实务 三科一体自用备考工具',
        theme_color: '#3E7A5E',
        background_color: '#F4F5F3',
        display: 'standalone',
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        // content/ 静态包走 network-first，保证每日更新能拉到
        runtimeCaching: [
          {
            urlPattern: /\/content\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'prep-content' }
          }
        ]
      }
    })
  ],
  base: './',
  preview: {
    // 允许 cloudflared 隧道域名访问（手机测试用，true = 放行所有 host）
    allowedHosts: true,
    cors: true
  },
  build: {
    // 行测页按需引入 ECharts，懒加载独立 chunk（首屏不加载），放宽提示阈值
    chunkSizeWarningLimit: 600
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/__tests__/setup.ts']
  }
})
