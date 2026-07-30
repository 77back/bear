<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useStatsStore } from '@/stores/stats'
import type { Course } from '@/db'

// 行测主页（学习入门阶段）：刷课进度 + 刷题记录；统计图表降级到 /xc/stats
const router = useRouter()
const courseStore = useCourseStore()
const statsStore = useStatsStore()

onMounted(() => {
  courseStore.load()
  statsStore.load()
})

/* ---------- 刷课进度 ---------- */
const newName = ref('')
const newTotal = ref<number | null>(null)
const editingId = ref<number | null>(null)
const editName = ref('')
const editTotal = ref<number | null>(null)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

const canAdd = computed(() => !!newName.value.trim() && !!newTotal.value && newTotal.value >= 1)

async function addCourse() {
  if (!canAdd.value || newTotal.value == null) return
  await courseStore.add(newName.value, newTotal.value)
  newName.value = ''
  newTotal.value = null
}

function startEdit(c: Course) {
  if (editingId.value === c.id) {
    editingId.value = null
    return
  }
  editingId.value = c.id!
  editName.value = c.name
  editTotal.value = c.totalLessons
}

async function saveEdit(id: number) {
  await courseStore.update(id, { name: editName.value, totalLessons: editTotal.value ?? undefined })
  editingId.value = null
}

async function removeCourse(id: number) {
  await courseStore.remove(id)
  editingId.value = null
  showToast('已删除课程')
}

/* ---------- 刷题记录 ---------- */
const recentLogs = computed(() =>
  [...statsStore.logs].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8)
)

function rateOf(l: { total: number; correct: number }) {
  return l.total ? Math.round((l.correct / l.total) * 100) + '%' : '—'
}
</script>

<template>
  <div>
    <div class="page-title">行测</div>
    <div class="page-sub">学习入门 · 刷课进度 · 刷题记录</div>

    <!-- 统计分析入口（二级页） -->
    <div class="card entry" @click="router.push('/xc/stats')">
      <div class="entry-info">
        <div class="entry-name">统计分析</div>
        <div class="entry-desc">周目标 · 板块正确率 · 14 天趋势 · 薄弱点</div>
      </div>
      <span class="entry-arrow">›</span>
    </div>

    <!-- 刷课进度 -->
    <div class="card">
      <div class="card-title">
        刷课进度
        <span class="more tnum" v-if="courseStore.overall.total">
          总进度 {{ courseStore.overall.done }}/{{ courseStore.overall.total }} 课时 ·
          {{ Math.round(courseStore.overall.pct * 100) }}%
        </span>
      </div>

      <div v-for="c in courseStore.courses" :key="c.id" class="course-row">
        <div class="course-head">
          <span class="course-name">{{ c.name }}</span>
          <span class="course-pct tnum">{{ Math.round(courseStore.pctOf(c) * 100) }}%</span>
        </div>
        <div class="bar course-bar">
          <i :style="{ width: Math.round(courseStore.pctOf(c) * 100) + '%', background: 'var(--xc)' }"></i>
        </div>
        <div class="course-foot">
          <span class="course-meta tnum">{{ c.doneLessons }}/{{ c.totalLessons }} 课时</span>
          <span class="course-ops">
            <button class="mini-btn" :disabled="c.doneLessons <= 0" @click="courseStore.decrementDone(c.id!)">−1</button>
            <button class="mini-btn primary" :disabled="c.doneLessons >= c.totalLessons" @click="courseStore.incrementDone(c.id!)">+1</button>
            <button class="mini-btn" @click="startEdit(c)">{{ editingId === c.id ? '收起' : '编辑' }}</button>
          </span>
        </div>
        <div v-if="editingId === c.id" class="course-edit">
          <div class="field">
            <label>课程名称</label>
            <input class="input" v-model="editName" placeholder="课程名称" />
          </div>
          <div class="field">
            <label>总课时</label>
            <input class="input" type="number" min="1" v-model.number="editTotal" />
          </div>
          <div class="edit-btns">
            <button class="btn btn-primary" @click="saveEdit(c.id!)">保存</button>
            <button class="btn btn-soft" @click="removeCourse(c.id!)">删除课程</button>
          </div>
        </div>
      </div>
      <div v-if="!courseStore.courses.length" style="font-size:12px;color:var(--text-3);margin-bottom:10px">
        还没有课程，先添加一门正在刷的课吧
      </div>

      <!-- 新增课程 -->
      <div class="add-form">
        <input class="input" v-model="newName" placeholder="课程名称，如 资料分析系统课" />
        <input class="input add-total" type="number" min="1" v-model.number="newTotal" placeholder="总课时" />
      </div>
      <button class="btn btn-soft" style="margin-top:10px" :disabled="!canAdd" @click="addCourse">添加课程</button>
    </div>

    <!-- 刷题记录 -->
    <div class="card">
      <div class="card-title">
        刷题记录
        <span class="more" v-if="statsStore.logs.length">共 {{ statsStore.logs.length }} 条</span>
      </div>
      <div v-if="recentLogs.length">
        <div v-for="l in recentLogs" :key="l.id" class="log-row">
          <span class="log-date tnum">{{ l.date.slice(5) }}</span>
          <span class="tag xc">{{ l.module }}</span>
          <span class="log-score tnum">{{ l.correct }}/{{ l.total }}</span>
          <span class="log-rate tnum">{{ rateOf(l) }}</span>
          <span v-if="l.weakPoints?.length" class="log-weak">{{ l.weakPoints.join('、') }}</span>
        </div>
      </div>
      <div v-else style="font-size:12px;color:var(--text-3);margin-bottom:10px">
        暂无刷题记录，手动录入或批量导入一组吧
      </div>
      <button class="btn btn-primary" style="margin-bottom:8px" @click="router.push('/xc/quiz')">手动录入</button>
      <button class="btn btn-soft" @click="router.push('/xc/import')">批量导入</button>
    </div>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* 统计分析入口 */
.entry {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.entry:active {
  transform: scale(0.98);
}
.entry-info {
  flex: 1;
  min-width: 0;
}
.entry-name {
  font-size: var(--fs-16);
  font-weight: 600;
}
.entry-desc {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 3px;
}
.entry-arrow {
  font-size: 22px;
  color: var(--text-3);
  line-height: 1;
}

/* 课程行 */
.course-row {
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}
.course-row:last-of-type {
  border: none;
}
.course-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.course-name {
  font-size: var(--fs-14);
  font-weight: 500;
}
.course-pct {
  font-size: 13px;
  font-weight: 600;
  color: var(--xc);
}
.course-bar {
  margin-bottom: 7px;
}
.course-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.course-meta {
  font-size: 12px;
  color: var(--text-3);
}
.course-ops {
  display: flex;
  gap: 6px;
}
.mini-btn {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1.5px solid var(--line);
  background: #fff;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.mini-btn.primary {
  border-color: var(--xc);
  color: var(--xc);
}
.mini-btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
.course-edit {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
}
.edit-btns {
  display: flex;
  gap: 8px;
}
.edit-btns .btn {
  min-height: 42px;
}

/* 新增课程表单 */
.add-form {
  display: flex;
  gap: 8px;
}
.add-total {
  width: 96px;
  flex-shrink: 0;
}

/* 刷题记录行 */
.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-14);
}
.log-row:last-of-type {
  border: none;
}
.log-date {
  font-size: 12px;
  color: var(--text-3);
  width: 38px;
  flex-shrink: 0;
}
.log-score {
  font-weight: 600;
}
.log-rate {
  font-size: 12px;
  color: var(--xc);
  font-weight: 600;
}
.log-weak {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
