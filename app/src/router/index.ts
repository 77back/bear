import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // hash 模式：PWA 离线 + file:// 兼容性最好，避免深路径 404
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/today', name: 'today', component: () => import('@/views/TodayView.vue') },
    { path: '/xc', name: 'xc', component: () => import('@/views/XingceView.vue') },
    { path: '/xc/quiz', name: 'xc-quiz', component: () => import('@/views/sub/QuizPage.vue') },
    { path: '/xc/import', name: 'xc-import', component: () => import('@/views/sub/ImportPage.vue') },
    { path: '/xc/stats', name: 'xc-stats', component: () => import('@/views/sub/XingceStats.vue') },
    { path: '/sl', name: 'sl', component: () => import('@/views/ShenlunView.vue') },
    { path: '/sl/material/:id', name: 'sl-material', component: () => import('@/views/sub/MaterialDetail.vue') },
    { path: '/sw', name: 'sw', component: () => import('@/views/ShiwuView.vue') },
    { path: '/sw/practice', name: 'sw-practice', component: () => import('@/views/sub/WritingPractice.vue') },
    { path: '/report', name: 'report', component: () => import('@/views/sub/ReportPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/sub/SettingsPage.vue') }
  ]
})

export default router
