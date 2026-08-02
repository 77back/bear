<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCardsStore, type Card } from '@/stores/cards'
import {
  buildSession,
  buildReviewQueue,
  gradeChoice,
  gradeJudge,
  selfGradeCorrect,
  isDirectAnswer,
  dueCardIds,
  coverageByTag,
  moduleSession,
  type CoverageRow
} from '@/core/cards'
import { todayStr, type CardMode } from '@/db'

/**
 * 随心练习（考点地图与命题库设计.md §六）：随机抽题、答一道来一道。
 * 选择/判断直答判分；填空/改错/问答翻面自评（会/模糊/不会）。
 * 答题记录写入本地卡片库，供后续系统化复习队列复用。
 */

const router = useRouter()
const store = useCardsStore()

type Phase = 'setup' | 'session' | 'done'
const phase = ref<Phase>('setup')

/* ---------- setup ---------- */
const institution = ref('全部')
const institutions = computed(() => {
  const order = ['新华社', '总台', '人民日报', '时政押题']
  const have = new Set(store.index.map((e) => e.institution))
  return ['全部', ...order.filter((o) => have.has(o))]
})
const totalCount = computed(() =>
  store.index
    .filter((e) => institution.value === '全部' || e.institution === institution.value)
    .reduce((s, e) => s + e.count, 0)
)
const masteredCount = computed(() => {
  let n = 0
  for (const s of store.states.values()) if (s.mastered) n++
  return n
})

/* ---------- session ---------- */
const mode = ref<CardMode>('casual')
const queue = ref<Card[]>([])
const pos = ref(0)
const answeredCount = ref(0)
const correctCount = ref(0)
const current = computed<Card | null>(() => queue.value[pos.value] ?? null)

const picked = ref<string[]>([]) // 选择题已选
const revealed = ref(false) // 已判分/已翻面
const lastCorrect = ref<boolean | null>(null)

const isMulti = computed(() => current.value?.kind === 'multi')
const optionLetters = computed(() => Object.keys(current.value?.options ?? {}).sort())

/* ---------- 系统化复习 ---------- */
const dueCount = computed(() => dueCardIds(store.states.values(), todayStr()).length)

async function startReview() {
  store.loading = true
  const cards = await store.loadAll()
  store.loading = false
  const session = buildReviewQueue(cards, store.states.values(), todayStr())
  if (!session.length) return
  mode.value = 'review'
  queue.value = session
  pos.value = 0
  answeredCount.value = 0
  correctCount.value = 0
  phase.value = 'session'
  resetCard()
}

/* ---------- 考点覆盖看板 ---------- */
const showCoverage = ref(false)
const coverage = ref<CoverageRow[]>([])

async function toggleCoverage() {
  showCoverage.value = !showCoverage.value
  if (showCoverage.value && !coverage.value.length) {
    store.loading = true
    const cards = await store.loadAll()
    store.loading = false
    coverage.value = coverageByTag(cards, store.states)
  }
}

/** 按模块系统复习：点覆盖看板某行 → 该模块全部题（未掌握在前） */
async function startModule(row: CoverageRow) {
  store.loading = true
  const cards = await store.loadAll()
  store.loading = false
  const session = moduleSession(cards, row.institution, row.tag, store.states)
  if (!session.length) return
  mode.value = 'casual'
  queue.value = session
  pos.value = 0
  answeredCount.value = 0
  correctCount.value = 0
  phase.value = 'session'
  resetCard()
}

async function start() {
  store.loading = true
  const cards = await store.loadAll()
  store.loading = false
  const session = buildSession(cards, { institution: institution.value })
  if (!session.length) return
  mode.value = 'casual'
  queue.value = session
  pos.value = 0
  answeredCount.value = 0
  correctCount.value = 0
  phase.value = 'session'
  resetCard()
}

function resetCard() {
  picked.value = []
  revealed.value = false
  lastCorrect.value = null
}

/* ---------- 答题 ---------- */
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
})
</script>

<template>
  <div>
    <div class="page-title">刷题复习</div>
    <div class="page-sub">随心练习 · 今日复习 · 按模块复习</div>

    <!-- 开局：选范围 -->
    <template v-if="phase === 'setup'">
      <div class="card">
        <div class="field">
          <label>范围</label>
          <div class="chip-row">
            <button
              v-for="ins in institutions"
              :key="ins"
              class="chip"
              :class="{ on: institution === ins }"
              @click="institution = ins"
            >{{ ins }}</button>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:12px">
          共 {{ totalCount }} 题<template v-if="masteredCount"> · 已掌握 {{ masteredCount }} 题</template>
        </div>
        <button class="btn btn-primary" :disabled="!totalCount || store.loading" @click="start">
          {{ store.loading ? '加载中…' : '开始练习' }}
        </button>
      </div>
      <!-- 系统化复习：错题到期队列 -->
      <div class="card">
        <div class="card-title" style="margin-bottom:6px">
          今日复习
          <span style="font-size:12px;color:var(--text-3);font-weight:400">到期 {{ dueCount }} 题</span>
        </div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:12px">
          {{ dueCount ? '做错的题按 1/3/7/15 天间隔回来，连续复习 4 次毕业' : '今日无到期复习。练习中做错的题会自动进入复习队列' }}
        </div>
        <button class="btn btn-primary" :disabled="!dueCount || store.loading" @click="startReview">
          {{ store.loading ? '加载中…' : '开始复习' }}
        </button>
      </div>

      <!-- 考点覆盖看板：点行进入该模块系统复习 -->
      <div class="card">
        <div class="card-title" style="margin-bottom:6px">
          按模块复习
          <button class="more" @click="toggleCoverage">{{ showCoverage ? '收起' : '展开' }}</button>
        </div>
        <template v-if="showCoverage">
          <div v-if="store.loading" style="font-size:13px;color:var(--text-3)">统计中…</div>
          <div v-else-if="!coverage.length" style="font-size:13px;color:var(--text-3)">题库暂未上线</div>
          <template v-else>
            <div style="font-size:12px;color:var(--text-3)">点击模块进入系统复习，未掌握的题排在前面</div>
            <div v-for="row in coverage" :key="row.label" class="cov-row" @click="startModule(row)">
              <div class="cov-head">
                <span>{{ row.label }}</span>
                <span class="cov-num">
                  {{ row.mastered }}/{{ row.total }}<template v-if="row.wrong"> · 复习中 {{ row.wrong }}</template>
                </span>
              </div>
              <div class="bar"><i :style="{ width: Math.round((row.mastered / row.total) * 100) + '%', background: 'var(--brand)' }"></i></div>
            </div>
          </template>
        </template>
        <div v-else style="font-size:13px;color:var(--text-3)">按机构 × 考点逐个模块攻克，含掌握进度</div>
      </div>

      <div v-if="!store.index.length" class="card" style="color:var(--text-3);font-size:13px">
        题库暂未上线，等内容更新后再来。
      </div>
      <button class="btn btn-soft" style="margin-bottom:12px" @click="router.back()">返回</button>
    </template>

    <!-- 答题 -->
    <template v-else-if="phase === 'session' && current">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);margin-bottom:8px">
        <span>{{ mode === 'review' ? '复习' : '第' }} {{ pos + 1 }} / {{ queue.length }} 题</span>
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

        <!-- 翻面自评（填空/改错/问答） -->
        <div v-else style="margin-top:12px">
          <button v-if="!revealed" class="btn btn-soft" @click="flip">看答案</button>
        </div>

        <!-- 判分/翻面后的答案区 -->
        <template v-if="revealed">
          <div v-if="lastCorrect !== null" class="verdict" :class="lastCorrect ? 'ok' : 'no'">
            {{ lastCorrect ? '✓ 答对了' : '✗ 答错了' }}
          </div>
          <div class="answer-box">
            <div><b>答案：</b>{{ current.answer }}</div>
            <div v-if="current.analysis" style="margin-top:6px"><b>解析：</b>{{ current.analysis }}</div>
          </div>
          <!-- 翻面卡自评 -->
          <div v-if="!isDirectAnswer(current) && lastCorrect === null" class="grade-row">
            <button class="btn btn-soft" @click="grade('know')">会</button>
            <button class="btn btn-soft" @click="grade('vague')">模糊</button>
            <button class="btn btn-soft" @click="grade('unknown')">不会</button>
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
      <button class="btn btn-primary" style="margin-bottom:12px" @click="phase = 'setup'">再来一轮</button>
      <button class="btn btn-soft" style="margin-bottom:12px" @click="router.back()">返回</button>
    </template>
  </div>
</template>

<style scoped>
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 6px 14px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--card);
  font-size: 13px;
  color: var(--text-2);
}
.chip.on {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
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
.cov-row {
  margin-top: 10px;
  cursor: pointer;
}
.cov-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 4px;
}
.cov-num {
  color: var(--text-3);
  font-size: 12px;
}
</style>
