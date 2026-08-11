import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // hash 模式：PWA 离线 + file:// 兼容性最好，避免深路径 404
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/today', name: 'today', component: () => import('@/views/TodayView.vue') },
    { path: '/sw', name: 'sw', component: () => import('@/views/ShiwuView.vue') },
    { path: '/media', name: 'media', component: () => import('@/views/MediaView.vue') },
    { path: '/sw/shizheng', name: 'sw-shizheng', component: () => import('@/views/sub/ShizhengLibrary.vue') },
    { path: '/sw/practice', name: 'sw-practice', component: () => import('@/views/sub/WritingPractice.vue') },
    { path: '/practice', name: 'practice', component: () => import('@/views/PracticeView.vue') },
    { path: '/exam', name: 'exam', component: () => import('@/views/sub/ExamAnalysis.vue') },
    { path: '/report', name: 'report', component: () => import('@/views/sub/ReportPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/sub/SettingsPage.vue') }
  ]
})

export default router
