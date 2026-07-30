<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStatsStore } from '@/stores/stats'
import { parseQuizImport, type ImportResult } from '@/core/xingceImport'

// 批量导入刷题记录：粘贴文本 → 解析预览（成功/失败明细）→ 确认写入 quizLogs
const router = useRouter()
const store = useStatsStore()

const text = ref('')
const parsed = ref<ImportResult | null>(null)
const importing = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}

function preview() {
  if (!text.value.trim()) {
    showToast('先粘贴要导入的文本')
    return
  }
  parsed.value = parseQuizImport(text.value)
}

async function confirmImport() {
  if (!parsed.value || parsed.value.records.length === 0 || importing.value) return
  importing.value = true
  const n = await store.importMany(parsed.value.records.map((r) => ({ ...r })))
  importing.value = false
  showToast(`已导入 ${n} 条刷题记录`)
  setTimeout(() => router.push('/xc'), 900)
}
</script>

<template>
  <div>
    <div class="page-title">批量导入</div>
    <div class="page-sub">每行一条：板块 总题数 正确数 [用时分钟] [薄弱标签]</div>

    <div class="card">
      <div class="field">
        <label>粘贴文本（空格 / 逗号 / 顿号分隔均可，可带日期前缀）</label>
        <textarea
          class="textarea"
          v-model="text"
          placeholder="资料分析 20 15 25 增长率&#10;判断推理,30,24&#10;2026-07-29 言语 40 32 逻辑填空"
        ></textarea>
      </div>
      <button class="btn btn-soft" :disabled="!text.trim()" @click="preview">解析预览</button>
    </div>

    <template v-if="parsed">
      <div v-if="parsed.records.length" class="card">
        <div class="card-title">解析成功 {{ parsed.records.length }} 条</div>
        <div v-for="(r, i) in parsed.records" :key="i" class="log-row">
          <span class="log-date tnum">{{ r.date }}</span>
          <span class="tag xc">{{ r.module }}</span>
          <span class="log-score tnum">{{ r.correct }}/{{ r.total }}</span>
          <span class="log-meta tnum" v-if="r.seconds != null">{{ Math.round(r.seconds / 60) }} 分钟</span>
          <span v-if="r.weakPoints?.length" class="log-weak">{{ r.weakPoints.join('、') }}</span>
        </div>
      </div>

      <div v-if="parsed.errors.length" class="card">
        <div class="card-title">失败 {{ parsed.errors.length }} 条</div>
        <div v-for="e in parsed.errors" :key="e.line" class="err-row">
          <span class="err-line tnum">第 {{ e.line }} 行</span>
          <span class="err-body">
            <span class="err-reason">{{ e.reason }}</span>
            <span class="err-text">{{ e.text }}</span>
          </span>
        </div>
      </div>

      <button
        class="btn btn-primary"
        style="margin-bottom:12px"
        :disabled="!parsed.records.length || importing"
        @click="confirmImport"
      >确认导入 {{ parsed.records.length }} 条</button>
    </template>

    <button class="btn btn-soft" style="margin-bottom:12px" @click="router.push('/xc')">返回行测</button>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>

<style scoped>
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
  flex-shrink: 0;
}
.log-score {
  font-weight: 600;
}
.log-meta {
  font-size: 12px;
  color: var(--text-3);
}
.log-weak {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.err-row {
  display: flex;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.err-row:last-of-type {
  border: none;
}
.err-line {
  color: var(--sw);
  font-weight: 600;
  flex-shrink: 0;
}
.err-body {
  min-width: 0;
}
.err-reason {
  color: var(--text);
}
.err-text {
  display: block;
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
