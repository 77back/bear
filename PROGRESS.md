# PROGRESS · 备考打卡助手

> 每阶段结束输出：完成清单 + 自测结果 + 已知问题（构建框架.md §十.6）。

---

## 脚手架 ✅

**完成清单**
- 仓库结构 `bear-prep/`（app / pipeline / content / .github/workflows）按 §四 落地。
- app 工具链：Vue3 + Vite6 + TS + Pinia + Vue Router(hash) + Dexie + ECharts(按需) + vitest3 + vite-plugin-pwa。
- `design-tokens.css`：从 `app原型.html` `:root` 原样抽取 token + reset。
- `styles/components.css`：原型全部可复用类（card/btn/tag/tabbar/hero/task-row/ring/stat-line/weak/flip/structure/grid/chip/cal-grid…），类名与原型对齐。
- `db/index.ts`：Dexie 版本1 全表 + 日期工具；`db/seed.ts` 首启默认设置。
- 路由 4 主 Tab + 5 二级页（lazy）；App.vue 状态栏 + 路由出口 + 底部 Tab。
- PWA 图标（192/512/maskable PNG）+ favicon.svg。

**自测**：`npm run build` 通过（PWA SW + manifest 生成）；`vite preview` 验证 index/manifest/icon 均 200。

---

## 阶段 1：今日任务 + 打卡 + 本地存储 ✅

**完成清单**
- `core/checkin.ts`（纯）：dayStat / isAllDone / heatLevel(§7.2 档位) / nextStreak / buildCheckin。
- `core/calendar.ts`（纯）：buildMonthCalendar（周一开头、月前补位、按完成率定档）、weekHead。
- `core/planner.ts`（纯）：阶段1 最简版——starterTemplate 启动模板 + materializeTasks（§7.1 完整算法留阶段2/后）。
- `stores/task.ts`：load（首启种子任务）/ toggle / addTask / removeTask / checkin / loadCalendar + 进度/连续天数派生。
- `views/TodayView.vue`：hero（昵称/距考天数/连续天数）、今日任务卡（勾选+调整增删+进度条）、打卡按钮、打卡日历热力图、周/月小结入口、设置入口。
- `views/sub/SettingsPage.vue`：考试日/周目标/每日分钟/昵称 可编辑保存。
- 撤销一致性：打卡后把任一任务改回 todo 自动撤销当日 checkin。

**验收（对照 §九 阶段1）**
- ✅ PWA 可加桌面（manifest+SW+图标齐）。
- ✅ 勾选任务进度联动。
- ✅ 全部完成打卡成功并写入 IndexedDB（checkins）。
- ✅ 刷新后数据不丢（持久化测试覆盖）。
- ✅ 热力图按完成率分档（≥100% l4 / ≥75% l3 / ≥40% l2 / >0% l1）。

**自测**：checkin.spec 14（含跨天 streak 中断与续接）、calendar.spec 4、task.spec 8（fake-indexeddb+假时钟）、TodayView.spec 2。

**已知问题 / 待办**
- 热力图随真实使用逐日填充（首启仅当日有数据，符合预期）。
- planner 完整 §7.1 算法（按正确率加权）待 stats 就位后补全。
- 推荐流（每日案例/素材）依赖内容管线，阶段3/4 接入。

---

## 阶段 2：行测统计 ✅

**完成清单**
- `core/stats.ts`（纯，§7.4）：moduleProgress（近30天板块进度）、dailyTrend（近14天按天聚合，无记录补0）、weakPoints（weakPoints 词频 Top5，无则模块垫底 fallback）、weeklyVolume（本周/上周/环比）、moduleRecentDelta（7天环比箭头）、advise（<65% 建议文案）。
- `components/EChart.vue`：echarts/core 按需封装（Line/Bar + Grid/Tooltip/MarkLine + CanvasRenderer）。
- `stores/stats.ts`：load / record / clearAll + modules/trend/weak/weekly/delta/advice/weekDone/ringPct 派生。
- `views/XingceView.vue`：周目标环（按实际题量/目标）、五板块进度（<65% 标橙）+7天环比箭头、近14天正确率趋势（ECharts 折线 + 65% 目标线）、薄弱知识点 Top、下周任务建议、录入入口。
- `views/sub/QuizPage.vue`：板块/总数/正确数（实时正确率预览）/用时/薄弱标签录入，校验 0≤正确≤总数。

**验收（对照 §九 阶段2）**
- ✅ 录入刷题记录后各板块进度与趋势图正确更新。
- ✅ 正确率 <65% 板块建议文案出现（advise 文案 + 进度条标橙）。
- ✅ 周目标环按实际题量计算（ringPct = min(1, 本周题量/周目标)）。
- ✅ 单元测试 stats 聚合（边界：某天无记录、全部正确、total=0）。

**自测**：stats.spec 12、stats store.spec 5。累计 45 通过。

**已知问题 / 待办**
- 周目标/各科时间占比的「周/月小结报告页」随阶段推进再深化。
- ECharts chunk 约 170KB(gzip)，懒加载仅行测页加载，首屏不受影响。

---

## 阶段 3：内容管线 ✅

**完成清单**
- `pipeline/`：requirements.txt（feedparser/httpx/openai/pyyaml）、sources.yaml（五类源，RSSHUB_BASE 可配）、common.py（指纹 sha1(标题+链接)/seen 管理/正文清洗/配置展开）。
- `fetch.py`（§8.2）：RSSHub 优先 + 栏目页直抓退化 + 两类失败跳过告警不阻塞；去重（seen）；正文<200字丢弃；每源 limit；输出 raw/{date}.json；五类覆盖校验。
- `process.py`（§8.3）：每类 prompt（含防幻觉铁律"仅使用原文事实，禁止凭记忆补全"）；LLM 客户端（有 key 用 openai，无 key 整体降级）；金句逐字校验 verify_quotes、要点 3-gram 校验 filter_points；API 失败重试2次降级为仅原文摘录；降级绝不编造。
- `build_content.py`（§8.4）：装配 content/daily/{date}.json（cases/article/shiwu+三练习/structure轮换/guoji）、shizheng/{month}.json（增量合并去重）、pinglun/index.json + 详情、index.json 最新清单。
- `sync_to_app.py`：content/ → app/public/content/ 同源托管。
- `.github/workflows/daily.yml`（§8.5）：cron 22:00 UTC + workflow_dispatch；fetch→process→build→sync→commit content/seen→npm build→deploy Pages。
- App：`stores/content.ts` 读取当日包（index.latest + dates 回退）；TodayView 推荐流展示每日案例 + 实务素材。

**验收（对照 §九 阶段3）**
- ✅ 管线产出 daily 包（本地实测 process+build 跑通，五类各≥1条）。
- ✅ 五类来源覆盖（fixture 全覆盖；fetch 缺类告警）。
- ✅ 断网打开 App 显示最近一次内容（content store dates 回退 + PWA SW NetworkFirst 缓存）。
- ✅ 抽查事实可溯源（金句逐字校验、要点 3-gram 校验、降级仅取原文切片——均有测试）。

**自测**：pipeline pytest 12（指纹/清洗/金句校验/要点校验/sanitize/降级不编造/产物装配/月度合并去重/评论库）；content store 3（load/回退/失败）。app 累计 48 通过。

**已知问题 / 待办**
- RSSHub 公共路由变动，CI 首跑可能部分源抓空 → fetch 告警提示补源；配自建 RSSHUB_BASE 更稳。
- LLM 加工需配 OPENAI_API_KEY Secret；未配时降级（仅原文摘录，结构字段稀疏但绝不编造）。
- 首跑 daily 包由 fixture 生成（示例）；正式内容由 CI 每日产出。

---

## 阶段 4：申论推荐 + 复习 ✅

**完成清单**
- `core/ebbinghaus.ts`（纯，§7.3）：STAGE_INTERVALS=[0,1,3,7,15]、createReviews（收藏→5条Review）、dueReviews（dueDate≤今天且未完成，按日期/stage升序，逾期合并）、stageBuckets、STAGE_LABEL。
- `stores/review.ts`：materials/reviews、collect（写 material + bulkAdd allKeys 生成 Review）、complete（标记 doneAt + 联动任务）、removeMaterial、due/dueCount/buckets 派生。
- `stores/task.ts` 增量：ensureReviewTask / setReviewTaskStatus —— 申论复习任务接入今日任务（复习完成计入）。
- `views/ShenlunView.vue`：今日复习遮挡卡（点击翻面看答案 + 复习完成）、stage 分桶标签、每日案例（content）+ 收藏、文章结构（content）、每日文章 + 收藏、素材库入口。
- `views/sub/MaterialDetail.vue`：素材库列表（按类型 chip 筛选）+ 展开详情。

**验收（对照 §九 阶段4）**
- ✅ 收藏案例后，次日复习列表出现 stage1（测试覆盖）。
- ✅ 遮挡卡点击翻面显示答案（ShenlunView flip 交互）。
- ✅ 复习完成计入当日任务（complete → setReviewTaskStatus(done)，测试覆盖）。
- ✅ 单测 ebbinghaus 调度：stage 间隔 [0,1,3,7,15]、逾期合并、已完成剔除（10 用例）。

**自测**：ebbinghaus.spec 10、review store.spec 5。app 累计 63 通过。

**已知问题 / 待办**
- 申论复习任务由 starter 模板与 review store 共同维护；手动勾选会被下次 sync 覆盖（符合"复习驱动"语义）。

---

## 阶段 5：实务练习 + 评论库 ✅

**完成清单**
- `core/recommend.ts`（纯，§7.5）：leastPracticedQtype（近14天最少题型，并列取规范首项）、qtypeCounts、shizhengPriority（考试日<30天置顶）。
- `stores/practice.ts`：practiceLogs load/record + counts/recommendQtype/total14 派生 + 可选 grade()（OpenAI 兼容接口批改，未配置返回 null）。
- `stores/content.ts` 扩展：loadShizheng(month)/loadPinglunIndex()/loadPinglunDetail(month,id)。
- `views/ShiwuView.vue`：四板块入口 grid4、每日案例+三练习按钮、练习推荐（统计驱动）、时政月统计（距考<30天置顶标橙）、国际新闻解读、评论案例库（按月/领域 chip 筛选）。
- `views/sub/WritingPractice.vue`：素材+题目要求、习作文本框、对照参考、保存记录、可选大模型批改。
- `views/sub/SettingsPage.vue` 增量：批改 API 配置（base/key/model，自用本地存储）。

**验收（对照 §九 阶段5）**
- ✅ 完成消息写作练习后记录入库（practiceLogs）。
- ✅ 评论库按月/领域筛选正确（chip 过滤逻辑）。
- ✅ 连续 14 天数据后薄弱（最少）题型被加推（leastPracticedQtype 测试覆盖）。
- ✅ 练习作答页：文本框 + 对照参考 + 可选大模型批改。

**自测**：recommend.spec 8、practice store.spec 3。app 累计 74 通过；pipeline pytest 12 通过。

**已知问题 / 待办**
- 批改 API key 存本地（自用 PWA 可接受）；公网部署应走后端代理。
- 评论领域标签来自管线（pinglun domains），降级模式下为空 → 领域筛选暂按全量；配 LLM 后填充。

---

## 反馈迭代 · 波次 1（2026-07-30）✅

> 依据 `../使用反馈与修改建议.md`（用户思维导图整理）。四项决策：行测统计页替换为入门记录页；刷课进度=课程清单+课时计数；刷题记录手动+粘贴批量导入都做；媒体常识接受人工维护静态内容。

**完成清单**
- 今日任务可编辑：`stores/task.ts` 新增 `updateTask(id, {title?, meta?})`（空 title 拒绝、id 不存在静默返回）；TodayView 调整模式行内编辑（Enter 保存 / Esc 取消）。
- 复盘归档入案例库：Material 加非索引字段 `archived?`（不动 schema 版本）；`stores/review.ts` complete() 走完 5 stage 自动归档并返回是否触发；ShenlunView 归档 toast；MaterialDetail 按「复习中 / 已归档」分组。
- 行测重构（替换主页）：
  - Dexie 升 version 2，新增 `courses` 表（++id, name, totalLessons, doneLessons, createdAt），旧表原样兼容。
  - `stores/course.ts`：增删改/±1 课时（封顶封底）/单课与整体进度派生。
  - `core/xingceImport.ts`（纯）：粘贴批量导入解析——`[日期] 板块 总数 正确 [用时分钟] [薄弱标签...]`，容忍空格/逗号/顿号/制表符，板块按 QUIZ_MODULES 归一别名（资料分析→资料 等），日期可选（默认今天），用时入库换算秒；逐行报错（行号+原因），空行跳过，绝不静默吞错。
  - 新 `/xc` 主页：统计分析入口 + 刷课进度卡（进度条/行内编辑/新增课程）+ 刷题记录卡（近 8 条 + 手动录入→QuizPage + 批量导入→新 ImportPage）。
  - 统计降级：`/xc/stats`（XingceStats.vue，旧五卡原样，ECharts 独立 chunk 507KB 仍懒加载）；`/xc/import`（粘贴→预览成功/失败明细→确认写入 quizLogs，stats store 新增 importMany）。
- 明确不做（用户标注可舍弃）：错题导入分析、600 字改写练习。

**自测**：vitest 14 文件 104 通过（task 11 / TodayView 4 / review 10 / course 6 / xingceImport 12 / ImportPage 2，余为既有用例无回归）；`npm run build` 通过（新主页 chunk 6.7KB，主 bundle 不含 ECharts）。

**已知问题 / 待办（波次 2/3）**
- 管线：sources 收敛头部央媒；申论文章统一分析（一篇产出结构+案例+话题领域分类）；每日好句子/标题产出。
- 实务：拟标题练习；评论选题清单机制（人工 topic 清单+六大央媒源）；"其他"只读板块（策划案例抓取 + 媒体常识人工静态 JSON）。




---

## 反馈迭代 · 波次 3b：媒体备考板块（2026-08-01）✅

> 用户第二轮反馈要求 2：新开「媒体备考」板块，只做信息搜集展示，不出题。

**完成清单**
- 数据层 `content/media/`（静态 JSON，人工维护）：
  - `orgs.json` 29 条机构常识（{id, org, point, detail, tag}）：新华社/人民日报/总台各 5 条，光明日报、工人日报、经济日报、中国青年报、新华社河南分社、河南日报、河南电视台各 2 条；tag 分「考过」（真题方向：创刊时间、任仲平署名、总台合并来源、5G+4K/8K+AI、获奖作品等）与「常识」。
  - `mediaKnowledge.json` 22 条（一带一路含义、媒体融合、四全媒体、两组「四力」、记者节、48 字职责使命等）。
  - `plans.json` 16 条：采访策划 8（采访对象+问题清单）、报道策划 8（栏目/形式/角度/传播），选题覆盖乡村振兴、文旅、基层治理、科技创新、就业民生、生态文明、粮食安全、文化传承、县域经济、重大主题。
  - `reports.json` 5 条调研报告提纲+写法提示（含通用模板骨架）。
  - 事实性内容保守处理：拿不准的（新华社获奖作品-年份对应、河南广播电视台组建年份、经济日报隶属表述、人民日报"世界十大报纸"排名、"大片看总台"官方表述）均在 detail 注明「待核实」，宁少勿假。
- App 层：
  - `stores/content.ts`：MediaOrg/MediaKnowledgeItem/MediaPlan/MediaReport 接口 + `loadMedia()`（四文件各自独立降级为空数组）。
  - `core/library.ts`：`filterMediaOrgs/filterMediaKnowledge/filterMediaPlans/filterMediaReports`（复用 kwMatch，机构/类型筛选+关键词交集）。
  - 底部导航加第 5 个 tab「媒体」（/media → MediaView.vue），SVG 广播图标沿用原型风格；tabbar flex:1，375px 下每 tab 约 75px、两字 label@10px 一行放下，无需改 CSS。
  - `MediaView.vue` 纯只读：五分区 chip 切换（机构常识/媒体常识/采访策划/报道策划/调研报告），机构常识内置机构 chip 筛选，行内展开详情；顶部关键词跨分区搜索（有关键词时展示所有命中的分区）。
- 管线（pipeline/）未动，自动抓取源后续再加。

**自测**：vitest 20 文件 161 通过（新增 13：store media 3 / core media 5 / MediaView 5，既有 148 无回归）；`npm run build` 通过（MediaView chunk 7.1KB）；`pipeline/sync_to_app.py` 已同步，`app/public/content/media/` 就位，build 产物 dist/content/media/ 已确认。

**已知问题 / 待办**
- 「待核实」条目需人工核对官方口径后补录（获奖作品年份、组建年份等）。
- 媒体板块目前纯静态，后续可接管线抓取源扩充策划案例。

