<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const tabs = [
  { to: '/today', label: '今日' },
  { to: '/xc', label: '行测' },
  { to: '/sl', label: '申论' },
  { to: '/sw', label: '实务' }
] as const

// 当前激活的 tab（子页归属到其主 tab）
const activeRoot = computed(() => {
  const seg = route.path.split('/')[1] || 'today'
  return ['today', 'xc', 'sl', 'sw'].includes(seg) ? `/${seg}` : '/today'
})
</script>

<template>
  <!-- 状态栏（装饰，自用 PWA 不追求像素级） -->
  <div class="statusbar">
    <span>9:41</span>
    <div class="icons">
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor"/><path d="M23.5 4v4a2 2 0 000-4z" fill="currentColor" opacity=".4"/></svg>
    </div>
  </div>

  <!-- 屏幕区：路由出口 -->
  <main class="screen active">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>

  <!-- 底部导航 -->
  <nav class="tabbar">
    <router-link
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      class="tab"
      :class="{ active: activeRoot === t.to }"
    >
      <!-- 图标：今日/行测/申论/实务，沿用原型 SVG -->
      <svg v-if="t.to === '/today'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      <svg v-else-if="t.to === '/xc'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>
      <svg v-else-if="t.to === '/sl'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4a2 2 0 00-2-2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-4 0V9"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>
      <span>{{ t.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.statusbar {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
  z-index: 5;
  background: var(--bg);
  padding-top: env(safe-area-inset-top);
}
.statusbar .icons {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--text);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
