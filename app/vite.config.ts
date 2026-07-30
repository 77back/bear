/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
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
