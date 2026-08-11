<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useCardsStore, type Card } from '@/stores/cards'
import {
  buildSession,
  buildReviewQueue,
  buildPracticeTree,
  nodeSession,
  gradeChoice,
  gradeJudge,
  selfGradeCorrect,
  isDirectAnswer,
  dueCardIds,
  wrongCount,
  wrongCards,
  type PracticeNode
} from '@shared/cards'
import { todayStr, type CardMode } from '@/db'

/**
 * 刷题主页（考点地图与命题库设计.md §六）。
 * 顶部工具行：今日复习（SRS 到期）/ 错题本 / 随心练习（随机 10 题）；
 * 主体为机构分类树（机构 → 一级标签/月份 → 二级考点），点叶子节点开刷。
 * 会话判分与 SRS 记录逻辑与原随心练习一致。
 */

const store = useCardsStore()

type Phase = 'home' | 'session' | 'done'
const phase = ref<Phase>('home')

/* ---------- 主页数据 ---------- */
const allCards = ref<Card[]>([])
const totalCount = computed(() => store.index.reduce((s, e) => s + e.count, 0))
const institutionSummary = computed(() => {
  const order = ['新华社', '人民日报', '总台', '时政押题']
  const have = new Set(store.index.map((e) => e.institution))
  return order.filter((o) => have.has(o)).join('/')
})

/** 机构分类树：随 states 变化自动刷新进度 */
const tree = computed(() => buildPracticeTree(allCards.value, store.states))

const openInst = ref('') // 展开的机构 key
const openGroup = ref('') // 展开的二级节点 key

function toggleInst(key: string) {
  openInst.value = openInst.value === key ? '' : key
  openGroup.value = ''
}
function toggleGroup(key: string) {
  openGroup.value = openGroup.value === key ? '' : key
}

/* ---------- 会话 ---------- */
const mode = ref<CardMode>('casual')
const sessionTitle = ref('')
const queue = ref<Card[]>([])
const pos = ref(0)
const answeredCount = ref(0)
const correctCount = ref(0)
const current = computed<Card | null>(() => queue.value[pos.value] ?? null)

const picked = ref<string[]>([]) // 选择题已选
const revealed = ref(false) // 已判分/已翻面
const lastCorrect = ref<boolean | null>(null)
const qaText = ref('') // 问答题用户输入（仅会话内，不持久化）

const isMulti = computed(() => current.value?.kind === 'multi')
const optionLetters = computed(() => Object.keys(current.value?.options ?? {}).sort())

const kindLabel: Record<string, string> = {
  single: '单选',
  multi: '多选',
  judge: '判断',
  fill: '填空',
  correct: '改错',
  qa: '问答'
}

function beginSession(cards: Card[], title: string, m: CardMode) {
  if (!cards.length) return
  mode.value = m
  sessionTitle.value = title
  queue.value = cards
  pos.value = 0
  answeredCount.value = 0
  correctCount.value = 0
  phase.value = 'session'
  resetCard()
}

/* ---------- 工具行 ---------- */
const dueCount = computed(() => dueCardIds(store.states.values(), todayStr()).length)
const wrongN = computed(() => wrongCount(store.states.values()))

/** 今日复习：SRS 到期队列 */
function startReview() {
  const session = buildReviewQueue(allCards.value, store.states.values(), todayStr())
  beginSession(session, '今日复习', 'review')
}

/** 错题本：当前错题直接开一轮专练（错次多的在前） */
function startWrongDrill() {
  const session = wrongCards(allCards.value, store.states).map((e) => e.card)
  beginSession(session, '错题本', 'casual')
}

/** 随心练习：全库随机 10 题 */
function startCasual() {
  const session = buildSession(allCards.value, {}).slice(0, 10)
  beginSession(session, '随心练习', 'casual')
}

/** 叶子节点开刷：未掌握在前 */
function startNode(node: PracticeNode, parentLabel?: string) {
  const session = nodeSession(allCards.value, node, store.states)
  beginSession(session, parentLabel ? `${parentLabel} · ${node.label}` : node.label, 'casual')
}

function resetCard() {
  picked.value = []
  revealed.value = false
  lastCorrect.value = null
  qaText.value = ''
}

/* ---------- 答题（与原随心练习同一套判分逻辑） ---------- */
function tapOption(letter: string) {
  if (revealed.value) return
  if (isMulti.value) {
    picked.value = picked.value.includes(letter)
      ? picked.value.filter((l) => l !== letter)
      : [...picked.value, letter]
  } else {
    picked.value = [letter]
    void finishDirect()
  }
}

async function finishDirect() {
  const card = current.value
  if (!card || revealed.value) return
  const correct = card.kind === 'judge' ? gradeJudge(card, picked.value[0] === '对') : gradeChoice(card, picked.value)
  await record(correct)
}

async function pickJudge(truth: boolean) {
  if (revealed.value) return
  picked.value = [truth ? '对' : '错']
  await finishDirect()
}

async function record(correct: boolean, selfGrade?: 'know' | 'vague' | 'unknown') {
  const card = current.value
  if (!card) return
  revealed.value = true
  lastCorrect.value = correct
  answeredCount.value += 1
  if (correct) correctCount.value += 1
  await store.recordAttempt(card, mode.value, correct, selfGrade)
}

async function flip() {
  revealed.value = true // 仅翻面，未判分
}

async function grade(g: 'know' | 'vague' | 'unknown') {
  await record(selfGradeCorrect(g), g)
}

function next() {
  if (pos.value + 1 >= queue.value.length) {
    phase.value = 'done'
    return
  }
  pos.value += 1
  resetCard()
}

function goExam() {
  uni.navigateTo({ url: '/pages/sub/exam' })
}

// 网页版 SPA 每次切 tab 重新挂载（onMounted 每次都跑），小程序 tab 页常驻，
// 对应生命周期是 onShow：每次进入本页都刷新 index/states/全量卡（loadAll 走 store 缓存）
onShow(async () => {
  await Promise.all([store.loadIndex(), store.loadStates()])
  store.loading = true
  allCards.value = await store.loadAll()
  store.loading = false
})
</script>

<template>
  <view class="page">
    <view class="page-title" style="display:flex;align-items:center">
      <text>刷题</text>
      <button class="exam-link" hover-class="none" @click="goExam">考情分析 ›</button>
    </view>
    <view class="page-sub">
      <template v-if="totalCount">{{ totalCount }} 题 · {{ institutionSummary }}</template>
      <template v-else>题库暂未上线</template>
    </view>

    <!-- 主页：工具行 + 机构分类树 -->
    <template v-if="phase === 'home'">
      <view class="tool-row">
        <button class="tool-card" :class="{ off: !dueCount }" hover-class="none" @click="startReview">
          <view class="tool-num">{{ dueCount }}</view>
          <view class="tool-name">今日复习</view>
          <view class="tool-sub">{{ dueCount ? '到期题优先巩固' : '今日无到期' }}</view>
        </button>
        <button class="tool-card" :class="{ off: !wrongN }" hover-class="none" @click="startWrongDrill">
          <view class="tool-num">{{ wrongN }}</view>
          <view class="tool-name">错题本</view>
          <view class="tool-sub">{{ wrongN ? '错题专练一轮' : '暂无错题' }}</view>
        </button>
        <button class="tool-card" :class="{ off: !totalCount }" hover-class="none" @click="startCasual">
          <view class="tool-num">10</view>
          <view class="tool-name">随心练习</view>
          <view class="tool-sub">随机来一组</view>
        </button>
      </view>

      <view
        v-if="store.loading && !allCards.length"
        class="card"
        style="text-align:center;color:var(--text-3);font-size:13px"
      >
        题库加载中…
      </view>
      <view v-else-if="!tree.length" class="card" style="color:var(--text-3);font-size:13px">
        题库暂未上线，等内容更新后再来。
      </view>

      <!-- 机构分类树 -->
      <view v-for="ins in tree" :key="ins.key" class="card tree-card">
        <view class="tree-head" @click="toggleInst(ins.key)">
          <text class="tree-label">{{ ins.label }}</text>
          <text class="tree-prog">做过 {{ ins.done }} / {{ ins.total }} · 掌握 {{ ins.mastered }}</text>
          <text class="tree-arrow" :class="{ open: openInst === ins.key }">›</text>
        </view>
        <view class="bar" style="margin-top:8px">
          <view
            class="bar-fill"
            :style="{ width: (ins.total ? Math.round((ins.mastered / ins.total) * 100) : 0) + '%', background: 'var(--brand)' }"
          ></view>
        </view>

        <template v-if="openInst === ins.key">
          <view v-for="g in ins.children" :key="g.key" class="l2">
            <!-- 有三级考点：可展开的分组行 -->
            <template v-if="g.children.length">
              <view class="tree-row" @click="toggleGroup(g.key)">
                <text class="tree-label">{{ g.label }}</text>
                <text class="tree-prog">{{ g.done }}/{{ g.total }} · 掌握 {{ g.mastered }}</text>
                <text class="tree-arrow" :class="{ open: openGroup === g.key }">›</text>
              </view>
              <template v-if="openGroup === g.key">
                <view
                  v-for="s in g.children"
                  :key="s.key"
                  class="tree-row leaf l3"
                  @click="startNode(s, `${ins.label} · ${g.label}`)"
                >
                  <text class="tree-label">{{ s.label }}</text>
                  <text class="tree-prog">{{ s.done }}/{{ s.total }} · 掌握 {{ s.mastered }}</text>
                  <text class="tree-go">开刷</text>
                </view>
              </template>
            </template>
            <!-- 叶子：直接开刷 -->
            <view v-else class="tree-row leaf" @click="startNode(g, ins.label)">
              <text class="tree-label">{{ g.label }}</text>
              <text class="tree-prog">{{ g.done }}/{{ g.total }} · 掌握 {{ g.mastered }}</text>
              <text class="tree-go">开刷</text>
            </view>
          </view>
        </template>
      </view>
    </template>

    <!-- 答题 -->
    <template v-else-if="phase === 'session' && current">
      <view style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);margin-bottom:8px">
        <text>{{ sessionTitle }} · 第 {{ pos + 1 }} / {{ queue.length }} 题</text>
        <text>已答 {{ answeredCount }} · 答对 {{ correctCount }}</text>
      </view>

      <view class="card">
        <view class="rec-head" style="margin-bottom:8px">
          <text class="tag sw">{{ current.source.institution }} · {{ current.source.doc }}</text>
          <text style="font-size:11px;color:var(--text-3)">{{ kindLabel[current.kind] }}</text>
        </view>
        <view style="font-size:15px;line-height:1.7;white-space:pre-wrap">{{ current.stem }}</view>

        <!-- 选择题 -->
        <view v-if="current.kind === 'single' || current.kind === 'multi'" style="margin-top:12px">
          <button
            v-for="l in optionLetters"
            :key="l"
            class="opt"
            hover-class="none"
            :class="{
              picked: picked.includes(l),
              right: revealed && (current.answer || '').includes(l),
              wrong: revealed && picked.includes(l) && !(current.answer || '').includes(l)
            }"
            @click="tapOption(l)"
          >
            <text class="opt-letter">{{ l }}.</text> {{ current.options?.[l] }}
          </button>
          <button
            v-if="isMulti && !revealed"
            class="btn btn-primary"
            hover-class="none"
            style="margin-top:10px"
            :disabled="!picked.length"
            @click="finishDirect"
          >提交</button>
        </view>

        <!-- 判断题 -->
        <view v-else-if="current.kind === 'judge'" style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-soft" hover-class="none" style="flex:1" :disabled="revealed" @click="pickJudge(true)">对</button>
          <button class="btn btn-soft" hover-class="none" style="flex:1" :disabled="revealed" @click="pickJudge(false)">错</button>
        </view>

        <!-- 问答题：先写下回答，再看参考答案对照自评 -->
        <view v-else-if="current.kind === 'qa'" style="margin-top:12px">
          <template v-if="!revealed">
            <textarea
              v-model="qaText"
              class="input qa-input"
              placeholder="先写下你的回答，再看参考答案"
            />
            <button class="btn btn-soft" hover-class="none" style="margin-top:8px" @click="flip">查看参考答案</button>
          </template>
        </view>

        <!-- 翻面自评（填空/改错） -->
        <view v-else style="margin-top:12px">
          <button v-if="!revealed" class="btn btn-soft" hover-class="none" @click="flip">看答案</button>
        </view>

        <!-- 判分/翻面后的答案区 -->
        <template v-if="revealed">
          <view v-if="lastCorrect !== null" class="verdict" :class="lastCorrect ? 'ok' : 'no'">
            {{ lastCorrect ? '✓ 答对了' : '✗ 答错了' }}
          </view>
          <view v-if="current.kind === 'qa' && qaText.trim()" class="answer-box">
            <view><text class="b">我的回答：</text>{{ qaText }}</view>
          </view>
          <view class="answer-box">
            <view><text class="b">{{ current.kind === 'qa' ? '参考答案' : '答案' }}：</text>{{ current.answer }}</view>
            <view v-if="current.analysis" style="margin-top:6px"><text class="b">解析：</text>{{ current.analysis }}</view>
          </view>
          <!-- 翻面卡自评 -->
          <view v-if="!isDirectAnswer(current) && lastCorrect === null" class="grade-row">
            <button class="btn btn-soft" hover-class="none" @click="grade('know')">答对</button>
            <button class="btn btn-soft" hover-class="none" @click="grade('vague')">模糊</button>
            <button class="btn btn-soft" hover-class="none" @click="grade('unknown')">答错</button>
          </view>
          <button v-else class="btn btn-primary" hover-class="none" style="margin-top:12px" @click="next">
            {{ pos + 1 >= queue.length ? '完成' : '下一题' }}
          </button>
        </template>
      </view>

      <button class="btn btn-soft" hover-class="none" style="margin-bottom:12px" @click="phase = 'done'">结束本轮</button>
    </template>

    <!-- 结算 -->
    <template v-else>
      <view class="card" style="text-align:center">
        <view style="font-size:16px;font-weight:600;margin-bottom:6px">本轮完成</view>
        <view style="font-size:14px;color:var(--text-2)">
          已答 {{ answeredCount }} 题 · 答对 {{ correctCount }} 题
          <template v-if="answeredCount">（{{ Math.round((correctCount / answeredCount) * 100) }}%）</template>
        </view>
        <view style="font-size:12px;color:var(--text-3);margin-top:8px">错题已自动记录，之后会优先复习</view>
      </view>
      <button class="btn btn-primary" hover-class="none" style="margin-bottom:12px" @click="phase = 'home'">回到刷题主页</button>
    </template>
  </view>
</template>

<style scoped>
.page {
  padding: 0 16px 32px;
}

/* 工具行：三张紧凑卡片 */
.tool-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.tool-card {
  flex: 1;
  margin: 0;
  line-height: 1.4;
  font-size: 13px;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 12px 6px 10px;
  text-align: center;
}
.tool-card.off {
  opacity: 0.55;
}
.tool-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--brand);
}
.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-top: 2px;
}
.tool-sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

/* 机构分类树 */
.tree-card {
  padding-bottom: 8px;
}
.tree-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tree-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.tree-prog {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.tree-arrow {
  color: var(--text-3);
  font-size: 16px;
  transition: transform 0.15s;
}
.tree-arrow.open {
  transform: rotate(90deg);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.tree-row .tree-label {
  font-weight: 400;
  color: var(--text-2);
}
.tree-row.l3 {
  padding-left: 14px;
}
.tree-go {
  font-size: 12px;
  color: var(--brand);
  white-space: nowrap;
}
/* 网页版 .bar > i 的填充条样式（小程序无 i 标签，改用 view.bar-fill） */
.bar > .bar-fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;
}

/* 会话（沿用原随心练习样式） */
.opt {
  display: block;
  width: 100%;
  margin: 0 0 8px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--card);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}
.opt.picked {
  border-color: var(--brand);
}
.opt.right {
  border-color: #2e7d32;
  background: #eef7ee;
}
.opt.wrong {
  border-color: #c62828;
  background: #fdeeee;
}
.opt-letter {
  font-weight: 700;
}
/* 小程序 button 默认边框/行高与网页版不一致，按需复位 */
.opt::after,
.tool-card::after,
.exam-link::after,
.btn::after {
  border: none;
}
.btn {
  line-height: 1.4;
}
.verdict {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 600;
}
.verdict.ok {
  color: #2e7d32;
}
.verdict.no {
  color: #c62828;
}
.answer-box {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}
.b {
  font-weight: 700;
}
.grade-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.grade-row .btn {
  flex: 1;
}
.qa-input {
  width: 100%;
  height: 110px;
  box-sizing: border-box;
  line-height: 1.7;
  font-family: inherit;
}
.exam-link {
  margin: 0 0 0 auto;
  padding: 4px 0 4px 12px;
  line-height: 1.4;
  font-size: 12px;
  color: var(--brand);
  background: none;
}
</style>
