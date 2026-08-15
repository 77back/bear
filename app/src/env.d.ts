/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** 构建标识（vite.config.ts define 注入：commit 短哈希 · 构建时间） */
declare const __BUILD_REV__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
