import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

import './design-tokens.css'
import './styles/components.css'
import { ensureSeed } from './db/seed'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 首次启动初始化（考试日默认值等），再挂载
ensureSeed().finally(() => {
  app.mount('#app')
})
