# 备考打卡助手 (bear-prep)

> 自用备考工具：行测（行为管理）+ 申论（积累管理）+ 新闻实务（内容管理）三科一体。
> 本地优先、PWA、内容自动化喂料。施工蓝图见上级 `构建框架.md`。

## 仓库结构

```
bear-prep/
├── app/          # Vue3 + Vite + Pinia PWA 前端（Dexie 本地存储）
├── pipeline/     # Python 内容管线（RSSHub 抓取 + 大模型加工）—— 阶段3
├── content/      # 管线产物（每日 JSON，随仓库提交）
└── .github/workflows/daily.yml  # 每日定时管线
```

## 快速开始（app）

```bash
cd app
npm install
npm run dev       # 本地开发
npm run test      # 单元 + 集成测试
npm run build     # 生产构建（含 PWA Service Worker）
npm run preview   # 预览构建产物
```

手机端：`npm run build && npm run preview`，手机浏览器打开后「添加到主屏幕」即安装为 PWA。

## 技术选型（已定死）

| 层 | 选型 |
|---|---|
| App | Vue 3 + Vite + Vue Router + Pinia + TypeScript |
| 形态 | PWA (vite-plugin-pwa) |
| 存储 | Dexie.js (IndexedDB) |
| 图表 | ECharts（按需） |
| UI | 自写 CSS，沿用 app 原型设计 token |
| 测试 | Vitest + @vue/test-utils + fake-indexeddb |
| 内容管线 | Python 3.11 + feedparser + httpx + openai |

## 开发阶段

按 `构建框架.md §九` 顺序施工，每阶段完成自测后写 `PROGRESS.md`。

- [x] 阶段 1：今日任务 + 打卡 + 本地存储
- [x] 阶段 2：行测统计
- [x] 阶段 3：内容管线
- [x] 阶段 4：申论推荐 + 复习
- [x] 阶段 5：实务练习 + 评论库
- [x] 反馈迭代波次 1：任务可编辑 / 复习归档入案例库 / 行测重构为入门记录（刷课进度 + 批量导入）
