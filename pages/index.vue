<script setup lang="ts">
import type { Question, QuestionPayload, QuizExport, Tag } from '~/types/quiz'

const api = useQuizApi()
const { data: account } = await useAccount()
const { data: examsData } = await useFetch('/api/exams')

const selectedTag = ref('')
const search = ref('')
const editingQuestion = ref<Question | null>(null)
const saving = ref(false)
const loading = ref(false)
const message = ref<{ type: 'success' | 'warning', text: string } | null>(null)
const importFile = ref<File | null>(null)
const formVersion = ref(0)

const questions = ref<Question[]>([])
const tags = ref<Tag[]>([])

async function loadData() {
  loading.value = true

  try {
    const [loadedQuestions, loadedTags] = await Promise.all([
      api.listQuestions({
        search: search.value || undefined,
        tag: selectedTag.value || undefined
      }),
      api.listTags()
    ])

    questions.value = loadedQuestions
    tags.value = loadedTags
  } finally {
    loading.value = false
  }
}

await loadData()

async function saveQuestion(payload: QuestionPayload) {
  saving.value = true
  message.value = null

  try {
    if (editingQuestion.value) {
      await api.updateQuestion(editingQuestion.value.id, payload)
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
  const confirmed = window.confirm(`Vas a borrar la pregunta:\n\n${question.prompt}`)

  if (!confirmed) {
    return
  }

  await api.deleteQuestion(question.id)

  if (editingQuestion.value?.id === question.id) {
    editingQuestion.value = null
  }

  message.value = { type: 'success', text: 'Pregunta borrada.' }
  await loadData()
}

async function editQuestion(question: Question) {
  try {
    editingQuestion.value = (await $fetch<{ question: Question }>(`/api/questions/${question.id}`)).question
  } catch {
    message.value = { type: 'warning', text: 'No se pudo cargar la pregunta.' }
  }
}

async function downloadExport() {
  try {
    const all = await api.listQuestions()
    const exported: QuestionPayload[] = []
    for (const item of all) {
      const q = (await $fetch<{ question: Question }>(`/api/questions/${item.id}`)).question
      exported.push({ prompt: q.prompt, imageDataUrl: q.imageDataUrl, explanation: q.explanation,
        note: q.note, tags: q.tags.map(t => t.name), answers: q.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect })) })
    }
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(),
      examName: examsData.value?.exams.find(e => e.id === api.examId)?.name, questions: exported }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `examen-${api.examId}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    message.value = { type: 'warning', text: 'No se pudo exportar el examen.' }
  }
}

async function importJson(replaceExisting = false) {
  if (!importFile.value) {
    message.value = { type: 'warning', text: 'Selecciona un fichero JSON primero.' }
    return
  }

  if (replaceExisting && !window.confirm('Se reemplazarán todas las preguntas de este examen. ¿Continuar?')) return

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
      text: `Importadas ${result.imported} preguntas. Total actual: ${result.total}.`
    }
    importFile.value = null
    await loadData()
  } catch (error: any) {
    message.value = {
      type: 'warning',
      text: error?.data?.statusMessage || error?.message || 'El fichero JSON no se pudo importar.'
    }
  }
}

watch([selectedTag, search], () => {
  loadData()
})

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
    <section class="stats-grid">
      <article class="stat-card panel">
        <span class="muted">Preguntas</span>
        <strong>{{ stats.totalQuestions }}</strong>
      </article>
      <article class="stat-card panel">
        <span class="muted">Respuestas</span>
        <strong>{{ stats.totalAnswers }}</strong>
      </article>
      <article class="stat-card panel">
        <span class="muted">Correctas marcadas</span>
        <strong>{{ stats.totalCorrect }}</strong>
      </article>
    </section>

    <section v-if="message" class="banner" :class="message.type">
      {{ message.text }}
    </section>

    <section class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>Filtros e intercambio</h2>
          <p class="muted">Busca por tema o intercambia las preguntas de este examen. Reemplazar solo afecta al examen seleccionado.</p>
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="search">Buscar</label>
          <input id="search" v-model="search" type="text" placeholder="API, Flow, security..." />
        </div>

        <div class="field">
          <label for="tag">Etiqueta</label>
          <select id="tag" v-model="selectedTag">
            <option value="">Todas</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }}</option>
          </select>
        </div>
      </div>

      <div class="toolbar" style="margin-top: 1rem;">
        <button class="btn primary" type="button" @click="downloadExport">Exportar JSON</button>
        <div v-if="account?.user?.role === 'admin'" class="pill-input">
          <input type="file" accept="application/json" @change="importFile = ($event.target as HTMLInputElement).files?.[0] || null">
          <button class="btn ghost" type="button" @click="importJson(false)">Importar sumando</button>
          <button class="btn danger" type="button" @click="importJson(true)">Importar reemplazando</button>
        </div>
      </div>
    </section>

    <div :class="account?.user?.role === 'admin' ? 'page-grid' : 'stack'">
      <QuestionForm
        v-if="account?.user?.role === 'admin'"
        :key="formVersion"
        :model-value="editingQuestion"
        :saving="saving"
        :exams="examsData?.exams"
        @cancel="editingQuestion = null"
        @save="saveQuestion"
      />

      <QuestionList
        :can-edit="account?.user?.role === 'admin'"
        :questions="questions"
        @edit="editQuestion"
        @remove="removeQuestion"
      />
    </div>

    <div v-if="loading" class="empty-state">
      Cargando preguntas...
    </div>
  </div>
</template>
