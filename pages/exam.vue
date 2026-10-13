<script setup lang="ts">
import type { Question, Tag } from '~/types/quiz'
import { questionTags, shuffledQuestions } from '~/utils/quiz.mjs'

const api = useQuizApi()

const { data: allQuestions, pending, error, refresh } = await useQuestionBank(api)
const tags = computed<(Tag & { count: number })[]>(() => questionTags(allQuestions.value))
const selectedTag = ref('')
const desiredCount = ref(Math.min(10, allQuestions.value.length) || 1)
const started = ref(false)
const submitted = ref(false)
const currentIndex = ref(0)
const answersByQuestion = ref<Record<number, number[]>>({})
const examQuestions = ref<Question[]>([])

const currentQuestion = computed(() => examQuestions.value[currentIndex.value] || null)
const pool = computed(() => selectedTag.value
  ? allQuestions.value.filter(question => question.tags.some(tag => tag.name === selectedTag.value))
  : allQuestions.value)
const validCount = computed(() => Number.isInteger(desiredCount.value)
  && desiredCount.value >= 1 && desiredCount.value <= pool.value.length)

watch(pool, (next, previous) => {
  if (started.value && !submitted.value) return
  if (desiredCount.value === previous.length || desiredCount.value > next.length) {
    desiredCount.value = Math.max(1, next.length)
  }
})

function startExam() {
  if (!validCount.value || pending.value) return
  examQuestions.value = shuffledQuestions(pool.value)
    .slice(0, Math.min(desiredCount.value, pool.value.length))

  answersByQuestion.value = {}
  currentIndex.value = 0
  started.value = true
  submitted.value = false
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
    <div v-if="pending" class="banner" role="status">Cargando preguntas...</div>
    <div v-if="error" class="banner warning" role="alert">
      No se pudieron cargar las preguntas.
      <button class="btn ghost small" type="button" :disabled="pending" @click="refresh()">Reintentar</button>
    </div>
    <section class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>Simulacro</h2>
          <p class="muted">Sesión cerrada con puntuación final y revisión de errores.</p>
        </div>
        <p class="muted" role="status" aria-live="polite">{{ pool.length }} preguntas disponibles</p>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="tag">Etiqueta</label>
          <select id="tag" v-model="selectedTag" :disabled="started && !submitted">
            <option value="">Todas ({{ allQuestions.length }})</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }} ({{ tag.count }})</option>
          </select>
        </div>

        <div class="field">
          <label for="count">Número de preguntas del simulacro</label>
          <input
            id="count"
            v-model.number="desiredCount"
            min="1"
            :max="pool.length || 1"
            type="number"
            aria-describedby="count-help"
            :aria-invalid="pool.length > 0 && !validCount"
            :disabled="started && !submitted"
          >
          <p v-if="pool.length" id="count-help" class="muted" style="margin: 0;">
            Puedes elegir entre 1 y {{ pool.length }} preguntas.
          </p>
        </div>
      </div>

      <div class="actions" style="margin-top: 1rem;">
        <button class="btn primary" type="button" :disabled="pending || !validCount" @click="startExam">
          {{ started ? 'Reiniciar examen' : 'Empezar examen' }}
        </button>
        <button
          class="btn ghost"
          type="button"
          :disabled="pending || !pool.length || (started && !submitted)"
          @click="desiredCount = pool.length"
        >
          Usar todas ({{ pool.length }})
        </button>

        <button
          v-if="started && !submitted"
          class="btn ghost"
          type="button"
          @click="submitted = true"
        >
          Corregir
        </button>
      </div>
      <p v-if="!pending && !error && !pool.length" class="empty-state">No hay preguntas para este examen y filtro. Añádelas desde Preguntas.</p>
    </section>

    <section v-if="started && currentQuestion" class="panel" style="padding: 1.25rem;">
      <img
        v-if="currentQuestion.imageUrl"
        class="question-image"
        :src="currentQuestion.imageUrl"
        alt="Imagen de apoyo para la pregunta"
      >

      <div class="section-title">
        <div>
          <p class="muted">Pregunta {{ currentIndex + 1 }} de {{ examQuestions.length }}</p>
          <h2>{{ currentQuestion.prompt }}</h2>
        </div>

        <div class="inline-actions">
          <button class="btn small ghost" type="button" :disabled="currentIndex === 0" @click="currentIndex -= 1">
            Anterior
          </button>
          <button class="btn small ghost" type="button" :disabled="currentIndex === examQuestions.length - 1" @click="currentIndex += 1">
            Siguiente
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
          {{ isQuestionCorrect(currentQuestion) ? 'Respuesta correcta.' : 'Respuesta incorrecta.' }}
        </div>
        <div v-if="currentQuestion.explanation" class="banner success">
          <strong>Explicación:</strong> {{ currentQuestion.explanation }}
        </div>
      </div>
    </section>

    <section v-if="score" class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>Resultado final</h2>
          <p class="muted">Revisión rápida de aciertos y fallos.</p>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <span class="muted">Aciertos</span>
          <strong>{{ score.correct }}</strong>
        </article>
        <article class="stat-card">
          <span class="muted">Total</span>
          <strong>{{ score.total }}</strong>
        </article>
        <article class="stat-card">
          <span class="muted">Porcentaje</span>
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
            alt="Imagen de apoyo para la pregunta"
          >
          <div class="section-title">
            <p>{{ question.prompt }}</p>
            <strong>{{ isQuestionCorrect(question) ? 'OK' : 'FAIL' }}</strong>
          </div>
          <p v-if="question.explanation" class="muted" style="margin-bottom: 0;">{{ question.explanation }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
