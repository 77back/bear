<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
} from '@/core/cards'
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

onMounted(async () => {
  await Promise.all([store.loadIndex(), store.loadStates()])
  store.loading = true
  allCards.value = await store.loadAll()
  store.loading = false
})
</script>

<template>
  <div>
    <div class="page-title">刷题</div>
    <div class="page-sub">
      <template v-if="totalCount">{{ totalCount }} 题 · {{ institutionSummary }}</template>
      <template v-else>题库暂未上线</template>
    </div>

    <!-- 主页：工具行 + 机构分类树 -->
    <template v-if="phase === 'home'">
      <div class="tool-row">
        <button class="tool-card" :class="{ off: !dueCount }" @click="startReview">
          <div class="tool-num">{{ dueCount }}</div>
          <div class="tool-name">今日复习</div>
          <div class="tool-sub">{{ dueCount ? '到期题优先巩固' : '今日无到期' }}</div>
        </button>
        <button class="tool-card" :class="{ off: !wrongN }" @click="startWrongDrill">
          <div class="tool-num">{{ wrongN }}</div>
          <div class="tool-name">错题本</div>
          <div class="tool-sub">{{ wrongN ? '错题专练一轮' : '暂无错题' }}</div>
        </button>
        <button class="tool-card" :class="{ off: !totalCount }" @click="startCasual">
          <div class="tool-num">10</div>
          <div class="tool-name">随心练习</div>
          <div class="tool-sub">随机来一组</div>
        </button>
      </div>

      <div v-if="store.loading && !allCards.length" class="card" style="text-align:center;color:var(--text-3);font-size:13px">
        题库加载中…
      </div>
      <div v-else-if="!tree.length" class="card" style="color:var(--text-3);font-size:13px">
        题库暂未上线，等内容更新后再来。
      </div>

      <!-- 机构分类树 -->
      <div v-for="ins in tree" :key="ins.key" class="card tree-card">
        <div class="tree-head" @click="toggleInst(ins.key)">
          <span class="tree-label">{{ ins.label }}</span>
          <span class="tree-prog">做过 {{ ins.done }} / {{ ins.total }} · 掌握 {{ ins.mastered }}</span>
          <span class="tree-arrow" :class="{ open: openInst === ins.key }">›</span>
        </div>
        <div class="bar" style="margin-top:8px">
          <i :style="{ width: (ins.total ? Math.round((ins.mastered / ins.total) * 100) : 0) + '%', background: 'var(--brand)' }"></i>
        </div>

        <template v-if="openInst === ins.key">
          <div v-for="g in ins.children" :key="g.key" class="l2">
            <!-- 有三级考点：可展开的分组行 -->
            <template v-if="g.children.length">
              <div class="tree-row" @click="toggleGroup(g.key)">
                <span class="tree-label">{{ g.label }}</span>
                <span class="tree-prog">{{ g.done }}/{{ g.total }} · 掌握 {{ g.mastered }}</span>
                <span class="tree-arrow" :class="{ open: openGroup === g.key }">›</span>
              </div>
              <template v-if="openGroup === g.key">
                <div
                  v-for="s in g.children"
                  :key="s.key"
                  class="tree-row leaf l3"
                  @click="startNode(s, `${ins.label} · ${g.label}`)"
                >
                  <span class="tree-label">{{ s.label }}</span>
                  <span class="tree-prog">{{ s.done }}/{{ s.total }} · 掌握 {{ s.mastered }}</span>
                  <span class="tree-go">开刷</span>
                </div>
              </template>
            </template>
            <!-- 叶子：直接开刷 -->
            <div v-else class="tree-row leaf" @click="startNode(g, ins.label)">
              <span class="tree-label">{{ g.label }}</span>
              <span class="tree-prog">{{ g.done }}/{{ g.total }} · 掌握 {{ g.mastered }}</span>
              <span class="tree-go">开刷</span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- 答题 -->
    <template v-else-if="phase === 'session' && current">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);margin-bottom:8px">
        <span>{{ sessionTitle }} · 第 {{ pos + 1 }} / {{ queue.length }} 题</span>
        <span>已答 {{ answeredCount }} · 答对 {{ correctCount }}</span>
      </div>

      <div class="card">
        <div class="rec-head" style="margin-bottom:8px">
          <span class="tag sw">{{ current.source.institution }} · {{ current.source.doc }}</span>
          <span style="font-size:11px;color:var(--text-3)">
            {{ { single: '单选', multi: '多选', judge: '判断', fill: '填空', correct: '改错', qa: '问答' }[current.kind] }}
          </span>
        </div>
        <div style="font-size:15px;line-height:1.7;white-space:pre-wrap">{{ current.stem }}</div>

        <!-- 选择题 -->
        <div v-if="current.kind === 'single' || current.kind === 'multi'" style="margin-top:12px">
          <button
            v-for="l in optionLetters"
            :key="l"
            class="opt"
            :class="{
              picked: picked.includes(l),
              right: revealed && (current.answer || '').includes(l),
              wrong: revealed && picked.includes(l) && !(current.answer || '').includes(l)
            }"
            @click="tapOption(l)"
          >
            <b>{{ l }}.</b> {{ current.options?.[l] }}
          </button>
          <button
            v-if="isMulti && !revealed"
            class="btn btn-primary"
            style="margin-top:10px"
            :disabled="!picked.length"
            @click="finishDirect"
          >提交</button>
        </div>

        <!-- 判断题 -->
        <div v-else-if="current.kind === 'judge'" style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-soft" style="flex:1" :disabled="revealed" @click="pickJudge(true)">对</button>
          <button class="btn btn-soft" style="flex:1" :disabled="revealed" @click="pickJudge(false)">错</button>
        </div>

        <!-- 问答题：先写下回答，再看参考答案对照自评 -->
        <div v-else-if="current.kind === 'qa'" style="margin-top:12px">
          <template v-if="!revealed">
            <textarea
              v-model="qaText"
              class="input qa-input"
              rows="4"
              placeholder="先写下你的回答，再看参考答案"
            ></textarea>
            <button class="btn btn-soft" style="margin-top:8px" @click="flip">查看参考答案</button>
          </template>
        </div>

        <!-- 翻面自评（填空/改错） -->
        <div v-else style="margin-top:12px">
          <button v-if="!revealed" class="btn btn-soft" @click="flip">看答案</button>
        </div>

        <!-- 判分/翻面后的答案区 -->
        <template v-if="revealed">
          <div v-if="lastCorrect !== null" class="verdict" :class="lastCorrect ? 'ok' : 'no'">
            {{ lastCorrect ? '✓ 答对了' : '✗ 答错了' }}
          </div>
          <div v-if="current.kind === 'qa' && qaText.trim()" class="answer-box">
            <div><b>我的回答：</b>{{ qaText }}</div>
          </div>
          <div class="answer-box">
            <div><b>{{ current.kind === 'qa' ? '参考答案' : '答案' }}：</b>{{ current.answer }}</div>
            <div v-if="current.analysis" style="margin-top:6px"><b>解析：</b>{{ current.analysis }}</div>
          </div>
          <!-- 翻面卡自评 -->
          <div v-if="!isDirectAnswer(current) && lastCorrect === null" class="grade-row">
            <button class="btn btn-soft" @click="grade('know')">答对</button>
            <button class="btn btn-soft" @click="grade('vague')">模糊</button>
            <button class="btn btn-soft" @click="grade('unknown')">答错</button>
          </div>
          <button v-else class="btn btn-primary" style="margin-top:12px" @click="next">
            {{ pos + 1 >= queue.length ? '完成' : '下一题' }}
          </button>
        </template>
      </div>

      <button class="btn btn-soft" style="margin-bottom:12px" @click="phase = 'done'">结束本轮</button>
    </template>

    <!-- 结算 -->
    <template v-else>
      <div class="card" style="text-align:center">
        <div style="font-size:16px;font-weight:600;margin-bottom:6px">本轮完成</div>
        <div style="font-size:14px;color:var(--text-2)">
          已答 {{ answeredCount }} 题 · 答对 {{ correctCount }} 题
          <template v-if="answeredCount">（{{ Math.round((correctCount / answeredCount) * 100) }}%）</template>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:8px">错题已自动记录，之后会优先复习</div>
      </div>
      <button class="btn btn-primary" style="margin-bottom:12px" @click="phase = 'home'">回到刷题主页</button>
    </template>
  </div>
</template>

<style scoped>
/* 工具行：三张紧凑卡片 */
.tool-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.tool-card {
  flex: 1;
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
  cursor: pointer;
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
  cursor: pointer;
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

/* 会话（沿用原随心练习样式） */
.opt {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 8px;
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
  box-sizing: border-box;
  resize: vertical;
  line-height: 1.7;
  font-family: inherit;
}
</style>
