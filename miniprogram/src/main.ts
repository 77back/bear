import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/design-tokens.css'
import './styles/components.css'
import { ensureSeed } from './db/seed'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  // 首次启动初始化（考试日默认值等），与网页版一致；不阻塞挂载
  ensureSeed()
  return { app }
}
