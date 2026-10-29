<script setup lang="ts">
import type { Question, Tag } from '~/types/quiz'
import { questionTags, sampleQuestions } from '~/utils/quiz.mjs'

const api = useQuizApi()
const { t } = useLanguage()

const { data: allQuestions, pending, error, refresh } = await useQuestionBank(api)
const tags = computed<(Tag & { count: number })[]>(() => questionTags(allQuestions.value))
const selectedTag = ref('')
const desiredCount = ref(Math.min(10, allQuestions.value.length) || 1)
const started = ref(false)
const submitted = ref(false)
const discardRequested = ref(false)
const currentIndex = ref(0)
const answersByQuestion = ref<Record<number, number[]>>({})
const examQuestions = ref<Question[]>([])

const currentQuestion = computed(() => examQuestions.value[currentIndex.value] || null)
const pool = computed(() => selectedTag.value
  ? allQuestions.value.filter(question => question.tags.some(tag => tag.name === selectedTag.value))
  : allQuestions.value)
const validCount = computed(() => Number.isInteger(desiredCount.value)
  && desiredCount.value >= 1 && desiredCount.value <= pool.value.length)
const inProgress = computed(() => started.value && !submitted.value)
const quickCounts = computed(() => [10, 20, 50, 100].filter(count => count <= pool.value.length))

watch(pool, (next, previous) => {
  if (started.value && !submitted.value) return
  if (desiredCount.value === previous.length || desiredCount.value > next.length) {
    desiredCount.value = Math.max(1, next.length)
  }
})

function startExam() {
  if (!validCount.value || pending.value || inProgress.value) return
  examQuestions.value = sampleQuestions(pool.value, desiredCount.value)

  answersByQuestion.value = {}
  currentIndex.value = 0
  started.value = true
  submitted.value = false
  discardRequested.value = false
}

function discardExam() {
  if (!discardRequested.value || !inProgress.value) return
  started.value = false
  submitted.value = false
  examQuestions.value = []
  answersByQuestion.value = {}
  currentIndex.value = 0
  discardRequested.value = false
}

function toggleAnswer(questionId: number, answerId: number | undefined, checked: boolean) {
  if (!answerId) {
    return
  }

  const selected = new Set(answersByQuestion.value[questionId] || [])

  if (checked) {
    selected.add(answerId)
  } else {
    selected.delete(answerId)
  }

  answersByQuestion.value = {
    ...answersByQuestion.value,
    [questionId]: [...selected]
  }
}

function isQuestionCorrect(question: Question) {
  const selected = [...(answersByQuestion.value[question.id] || [])].sort((a, b) => a - b)
  const correct = question.answers.filter(answer => answer.isCorrect).map(answer => answer.id as number).sort((a, b) => a - b)

  return JSON.stringify(selected) === JSON.stringify(correct)
}

const score = computed(() => {
  if (!submitted.value) {
    return null
  }

  const correct = examQuestions.value.filter(isQuestionCorrect).length
  const total = examQuestions.value.length

  return {
    correct,
    total,
    percentage: total ? Math.round((correct / total) * 100) : 0
  }
})
</script>

<template>
  <div class="stack">
    <ExamHeading :exam-id="api.examId" />
    <div v-if="pending" class="banner" role="status">{{ t('Cargando preguntas...') }}</div>
    <div v-if="error" class="banner warning" role="alert">
      {{ t('No se pudieron cargar las preguntas.') }}
      <button class="btn ghost small" type="button" :disabled="pending" @click="refresh()">{{ t('Reintentar') }}</button>
    </div>
    <section class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>{{ t('Simulacro') }}</h2>
          <p class="muted">{{ t('Elige cuántas preguntas quieres y genera un simulacro aleatorio, sin repeticiones.') }}</p>
        </div>
        <p class="muted" role="status" aria-live="polite">{{ t(pool.length === 1 ? '1 pregunta disponible' : '{count} preguntas disponibles', { count: pool.length }) }}</p>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="tag">{{ t('Etiqueta') }}</label>
          <select id="tag" v-model="selectedTag" :disabled="started && !submitted">
            <option value="">{{ t('Todas ({count})', { count: allQuestions.length }) }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }} ({{ tag.count }})</option>
          </select>
        </div>

        <div class="field">
          <label for="count">{{ t('Número de preguntas del simulacro') }}</label>
          <input
            id="count"
            v-model.number="desiredCount"
            min="1"
            :max="pool.length || 1"
            type="number"
            step="1"
            :aria-describedby="!validCount && pool.length ? 'count-help count-error' : 'count-help'"
            :aria-invalid="pool.length > 0 && !validCount"
            :disabled="started && !submitted"
          >
          <p v-if="pool.length" id="count-help" class="muted" style="margin: 0;">
            {{ t('Puedes elegir entre 1 y {count} preguntas.', { count: pool.length }) }}
          </p>
          <p v-if="pool.length && !validCount" id="count-error" class="form-error" role="alert">
            {{ t('Introduce un número entero entre 1 y {count}.', { count: pool.length }) }}
          </p>
          <div v-if="quickCounts.length" class="inline-actions quick-counts" role="group" :aria-label="t('Tamaños rápidos')">
            <button
              v-for="count in quickCounts"
              :key="count"
              class="btn ghost small"
              type="button"
              :aria-pressed="desiredCount === count"
              :disabled="pending || inProgress"
              @click="desiredCount = count"
            >{{ t('{count} preguntas', { count }) }}</button>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top: 1rem;">
        <button v-if="!inProgress" class="btn primary" type="button" :disabled="pending || !validCount" @click="startExam">
          {{ t(started ? 'Crear otro simulacro aleatorio' : 'Crear simulacro aleatorio') }}
        </button>
        <button class="btn ghost" type="button" :disabled="pending || (started && !submitted)" @click="refresh()">{{ t('Actualizar preguntas') }}</button>
        <button
          class="btn ghost"
          type="button"
          :disabled="pending || !pool.length || (started && !submitted)"
          @click="desiredCount = pool.length"
        >
          {{ t('Usar todas ({count})', { count: pool.length }) }}
        </button>

        <button
          v-if="started && !submitted"
          class="btn primary"
          type="button"
          @click="submitted = true"
        >
          {{ t('Corregir') }}
        </button>
        <button v-if="inProgress" class="btn ghost" type="button" :aria-expanded="discardRequested" aria-controls="discard-confirmation" @click="discardRequested = true">{{ t('Descartar simulacro') }}</button>
      </div>
      <div v-if="inProgress && discardRequested" id="discard-confirmation" class="banner warning" role="alert" style="margin-top: 1rem;">
        <p>{{ t('Se perderán las respuestas de este simulacro. ¿Descartarlo y cambiar la configuración?') }}</p>
        <div class="actions">
          <button class="btn ghost" type="button" @click="discardRequested = false">{{ t('Cancelar') }}</button>
          <button class="btn danger" type="button" @click="discardExam">{{ t('Descartar y cambiar configuración') }}</button>
        </div>
      </div>
      <p v-if="!inProgress && validCount" class="muted">
        {{ t('Se elegirán {count} preguntas al azar del filtro seleccionado. Cada nuevo simulacro vuelve a sortearlas.', { count: desiredCount }) }}
      </p>
      <p v-if="!pending && !error && !pool.length" class="empty-state">{{ t('No hay preguntas para este examen y filtro. Añádelas desde Preguntas.') }}</p>
    </section>

    <section v-if="started && currentQuestion" class="panel" style="padding: 1.25rem;">
      <img
        v-if="currentQuestion.imageUrl"
        class="question-image"
        :src="currentQuestion.imageUrl"
        :alt="t('Imagen de apoyo para la pregunta')"
      >

      <div class="section-title">
        <div>
          <p class="muted">{{ t('Pregunta {current} de {total}', { current: currentIndex + 1, total: examQuestions.length }) }}</p>
          <h2>{{ currentQuestion.prompt }}</h2>
        </div>

        <div class="inline-actions">
          <button class="btn small ghost" type="button" :disabled="currentIndex === 0" @click="currentIndex -= 1">
            {{ t('Anterior') }}
          </button>
          <button class="btn small ghost" type="button" :disabled="currentIndex === examQuestions.length - 1" @click="currentIndex += 1">
            {{ t('Siguiente') }}
          </button>
        </div>
      </div>

      <div class="choice-list">
        <label
          v-for="answer in currentQuestion.answers"
          :key="answer.id || answer.text"
          class="choice"
          :class="{
            correct: submitted && answer.isCorrect,
            incorrect: submitted && (answersByQuestion[currentQuestion.id] || []).includes(answer.id || -1) && !answer.isCorrect
          }"
        >
          <input
            type="checkbox"
            :disabled="submitted"
            :checked="(answersByQuestion[currentQuestion.id] || []).includes(answer.id || -1)"
            @change="toggleAnswer(currentQuestion.id, answer.id, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ answer.text }}</span>
        </label>
      </div>

      <div v-if="submitted" class="stack">
        <div class="banner" :class="isQuestionCorrect(currentQuestion) ? 'success' : 'warning'">
          {{ t(isQuestionCorrect(currentQuestion) ? 'Respuesta correcta.' : 'Respuesta incorrecta.') }}
        </div>
        <div v-if="currentQuestion.explanation" class="banner success">
          <strong>{{ t('Explicación:') }}</strong> {{ currentQuestion.explanation }}
        </div>
      </div>
    </section>

    <section v-if="score" class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>{{ t('Resultado final') }}</h2>
          <p class="muted">{{ t('Revisión rápida de aciertos y fallos.') }}</p>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <span class="muted">{{ t('Aciertos') }}</span>
          <strong>{{ score.correct }}</strong>
        </article>
        <article class="stat-card">
          <span class="muted">{{ t('Total') }}</span>
          <strong>{{ score.total }}</strong>
        </article>
        <article class="stat-card">
          <span class="muted">{{ t('Porcentaje') }}</span>
          <strong>{{ score.percentage }}%</strong>
        </article>
      </div>

      <div class="result-list" style="margin-top: 1rem;">
        <article
          v-for="question in examQuestions"
          :key="question.id"
          class="result-card"
        >
          <img
            v-if="question.imageUrl"
            class="question-image compact"
            :src="question.imageUrl"
            :alt="t('Imagen de apoyo para la pregunta')"
          >
          <div class="section-title">
            <p>{{ question.prompt }}</p>
            <strong>{{ t(isQuestionCorrect(question) ? 'OK' : 'FAIL') }}</strong>
          </div>
          <p v-if="question.explanation" class="muted" style="margin-bottom: 0;">{{ question.explanation }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
