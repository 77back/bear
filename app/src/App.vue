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
  <!-- 顶部安全区间距（刘海屏/灵动岛，standalone 模式下内容避让系统状态栏） -->
  <div class="safe-top"></div>

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
.safe-top {
  height: env(safe-area-inset-top);
  flex-shrink: 0;
  background: var(--bg);
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
