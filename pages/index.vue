<script setup lang="ts">
import type { Question, QuestionPayload, QuizExport, Tag } from '~/types/quiz'
import { questionTags } from '~/utils/quiz.mjs'

const api = useQuizApi()
const { t } = useLanguage()
const { data: account } = await useAccount()
const { data: examsData } = await useFetch('/api/exams')

const selectedTag = ref('')
const search = ref('')
const editingQuestion = ref<Question | null>(null)
const showEditor = ref(false)
const questionEditor = ref<HTMLElement | null>(null)
function toggleEditor() {
  const wasOpen = showEditor.value || Boolean(editingQuestion.value)
  showEditor.value = !wasOpen
  if (wasOpen) editingQuestion.value = null
}
const saving = ref(false)
const loading = ref(false)
const message = ref<{ type: 'success' | 'warning', text: string, values?: Record<string, string | number> } | null>(null)
const importFile = ref<File | null>(null)
const formVersion = ref(0)
const exporting = ref(false)
const importing = ref(false)
const deleting = ref(false)

const { data: allQuestions, pending, error: loadError, refresh: refreshBank } = await useQuestionBank(api)
const tags = computed<Tag[]>(() => questionTags(allQuestions.value))
const questions = computed(() => {
  const term = search.value.trim().toLowerCase()
  return allQuestions.value.filter(question =>
    (!selectedTag.value || question.tags.some(tag => tag.name === selectedTag.value)) &&
    (!term || [question.prompt, question.explanation, question.note].some(text => text.toLowerCase().includes(term))))
})

async function loadData() {
  loading.value = true

  try {
    await refreshBank()
    if (loadError.value) throw loadError.value
  } finally {
    loading.value = false
  }
}

async function saveQuestion(payload: QuestionPayload) {
  saving.value = true
  message.value = null

  try {
    if (editingQuestion.value) {
      await api.updateQuestion(editingQuestion.value.id, payload)
      if (payload.examId && payload.examId !== api.examId) clearNuxtData(`question-bank:${payload.examId}`)
      message.value = { type: 'success', text: 'Pregunta actualizada.' }
    } else {
      await api.createQuestion(payload)
      message.value = { type: 'success', text: 'Pregunta creada.' }
    }

    editingQuestion.value = null
    formVersion.value += 1
    await loadData()
  } catch (error: any) {
    message.value = {
      type: 'warning',
      text: error?.data?.statusMessage || error?.message || 'No se pudo guardar la pregunta.'
    }
  } finally {
    saving.value = false
  }
}

async function removeQuestion(question: Question) {
  if (deleting.value) return
  const confirmed = window.confirm(t('Vas a borrar la pregunta:\n\n{prompt}', { prompt: question.prompt }))

  if (!confirmed) {
    return
  }

  deleting.value = true
  try {
    await api.deleteQuestion(question.id)
    if (editingQuestion.value?.id === question.id) editingQuestion.value = null
    message.value = { type: 'success', text: 'Pregunta borrada.' }
    await loadData()
  } catch (error: any) {
    message.value = { type: 'warning', text: error?.data?.statusMessage || 'No se pudo borrar la pregunta.' }
  } finally {
    deleting.value = false
  }
}

async function editQuestion(question: Question) {
  try {
    editingQuestion.value = (await $fetch<{ question: Question }>(`/api/questions/${question.id}`)).question
    await nextTick()
    questionEditor.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  } catch {
    message.value = { type: 'warning', text: 'No se pudo cargar la pregunta.' }
  }
}

async function downloadExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    let exported: QuizExport
    try {
      exported = await api.exportJson()
    } catch (error: any) {
      if (error?.statusCode !== 413 && error?.response?.status !== 413) throw error
      // Large image exports exceed the server response limit; fetch only those images separately.
      const bank = await api.listQuestions()
      const payloads: QuestionPayload[] = []
      for (const item of bank) {
        const q = item.imageUrl
          ? (await $fetch<{ question: Question }>(`/api/questions/${item.id}`)).question
          : item
        payloads.push({ prompt: q.prompt, imageDataUrl: q.imageDataUrl, explanation: q.explanation,
          note: q.note, tags: q.tags.map(t => t.name), answers: q.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect })) })
      }
      exported = { version: 1, exportedAt: new Date().toISOString(),
        examName: examsData.value?.exams.find(e => e.id === api.examId)?.name, questions: payloads }
    }
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `examen-${api.examId}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    message.value = { type: 'warning', text: 'No se pudo exportar el examen.' }
  } finally {
    exporting.value = false
  }
}

async function importJson(replaceExisting = false) {
  if (importing.value) return
  if (!importFile.value) {
    message.value = { type: 'warning', text: 'Selecciona un fichero JSON primero.' }
    return
  }

  if (replaceExisting && !window.confirm(t('Se reemplazarán todas las preguntas de este examen. ¿Continuar?'))) return

  importing.value = true
  try {
    const raw = await importFile.value.text()
    if (new Blob([raw]).size > 3_000_000) throw new Error('Importa archivos de hasta 3 MB y 100 preguntas.')
    const parsed = JSON.parse(raw) as QuizExport

    const result = await api.importJson({
      ...parsed,
      replaceExisting
    })

    message.value = {
      type: 'success',
      text: 'Importadas {count} preguntas. Total actual: {total}.',
      values: { count: result.imported, total: result.total }
    }
    importFile.value = null
    await loadData()
  } catch (error: any) {
    message.value = {
      type: 'warning',
      text: error?.data?.statusMessage || error?.message || 'El fichero JSON no se pudo importar.'
    }
  } finally {
    importing.value = false
  }
}

const stats = computed(() => {
  const totalAnswers = questions.value.reduce((sum, question) => sum + question.answers.length, 0)
  const totalCorrect = questions.value.reduce((sum, question) => sum + question.answers.filter(answer => answer.isCorrect).length, 0)

  return {
    totalQuestions: questions.value.length,
    totalAnswers,
    totalCorrect
  }
})
</script>

<template>
  <div class="stack">
    <ExamHeading :exam-id="api.examId" />
    <div v-if="loadError" class="banner warning" role="alert">
      {{ t('No se pudieron cargar las preguntas.') }}
      <button class="btn ghost small" type="button" :disabled="pending" @click="refreshBank()">{{ t('Reintentar') }}</button>
    </div>
    <section class="stats-grid">
      <article class="stat-card panel">
        <span class="muted">{{ t('Preguntas') }}</span>
        <strong>{{ stats.totalQuestions }}</strong>
      </article>
      <article class="stat-card panel">
        <span class="muted">{{ t('Respuestas') }}</span>
        <strong>{{ stats.totalAnswers }}</strong>
      </article>
      <article class="stat-card panel">
        <span class="muted">{{ t('Correctas marcadas') }}</span>
        <strong>{{ stats.totalCorrect }}</strong>
      </article>
    </section>

    <section v-if="message" class="banner" :class="message.type">
      {{ t(message.text, message.values) }}
    </section>

    <section class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>{{ t('Filtros e intercambio') }}</h2>
          <p class="muted">{{ t('Busca por tema o intercambia las preguntas de este examen. Reemplazar solo afecta al examen seleccionado.') }}</p>
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="search">{{ t('Buscar') }}</label>
          <input id="search" v-model="search" type="text" placeholder="API, Flow, security..." />
        </div>

        <div class="field">
          <label for="tag">{{ t('Etiqueta') }}</label>
          <select id="tag" v-model="selectedTag">
            <option value="">{{ t('Todas') }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }}</option>
          </select>
        </div>
      </div>

      <div class="toolbar" style="margin-top: 1rem;">
        <button class="btn ghost" type="button" :disabled="pending || loading || saving || importing || deleting" @click="loadData()">{{ t('Actualizar preguntas') }}</button>
        <button class="btn primary" type="button" :disabled="exporting || pending" @click="downloadExport">
          {{ t(exporting ? 'Exportando...' : 'Exportar JSON') }}
        </button>
        <div v-if="account?.user?.role === 'admin'" class="pill-input">
          <label class="sr-only" for="bank-import">{{ t('Archivo JSON de preguntas') }}</label>
          <input id="bank-import" type="file" accept="application/json" :disabled="importing" @change="importFile = ($event.target as HTMLInputElement).files?.[0] || null">
          <button class="btn ghost" type="button" :disabled="importing || saving || deleting" @click="importJson(false)">{{ t(importing ? 'Importando...' : 'Importar sumando') }}</button>
          <button class="btn danger" type="button" :disabled="importing || saving || deleting" @click="importJson(true)">{{ t('Importar reemplazando') }}</button>
        </div>
      </div>
    </section>

    <div :class="account?.user?.role === 'admin' ? 'page-grid' : 'stack'">
      <section v-if="account?.user?.role === 'admin'" ref="questionEditor" class="question-editor" :class="{ 'is-open': showEditor || editingQuestion }">
        <button class="btn ghost editor-toggle" type="button" :aria-expanded="Boolean(showEditor || editingQuestion)" aria-controls="question-editor-content" @click="toggleEditor">{{ t(showEditor || editingQuestion ? 'Ocultar formulario' : 'Nueva pregunta') }}</button>
        <div id="question-editor-content" class="editor-content">
          <QuestionForm
            :key="formVersion"
            :model-value="editingQuestion"
            :saving="saving"
            :exams="examsData?.exams"
            @cancel="editingQuestion = null"
            @save="saveQuestion"
          />
        </div>
      </section>

      <QuestionList
        :can-edit="account?.user?.role === 'admin'"
        :questions="questions"
        :busy="loading || pending || saving || importing || deleting"
        @edit="editQuestion"
        @remove="removeQuestion"
      />
    </div>

    <div v-if="loading || pending" class="empty-state" role="status">
      {{ t('Cargando preguntas...') }}
    </div>
  </div>
</template>
