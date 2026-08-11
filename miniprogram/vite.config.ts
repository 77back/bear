import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 共享网页版纯逻辑（core/*.ts 无 DOM 依赖），避免双份维护
      '@shared': fileURLToPath(new URL('../app/src/core', import.meta.url))
    }
  }
})
