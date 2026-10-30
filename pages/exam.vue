<script setup lang="ts">
import type { AttemptPayload, SavedAttempt, Question, SessionMode, Tag } from '~/types/quiz'
import { questionTags, sampleQuestions } from '~/utils/quiz.mjs'
import { allowsMultipleAnswers, canRevealAnswers, evaluateSelection, selectAnswer } from '~/utils/exam-session.mjs'
import { answerBadge, answerFeedback } from '~/utils/pdf-solution.mjs'
import { replayQuestions } from '~/utils/replay.mjs'

const api = useQuizApi()
const { t, language } = useLanguage()

const { data: allQuestions, pending, error, refresh } = await useQuestionBank(api)
const tags = computed<(Tag & { count: number })[]>(() => questionTags(allQuestions.value))
const selectedTag = ref('')
const desiredCount = ref(Math.min(10, allQuestions.value.length) || 1)
const mode = ref<SessionMode>('practice')
const sessionMode = ref<SessionMode>('practice')
const started = ref(false)
const submitted = ref(false)
const discardRequested = ref(false)
const currentIndex = ref(0)
const answersByQuestion = ref<Record<number, number[]>>({})
const examQuestions = ref<Question[]>([])
const questionHeading = ref<HTMLHeadingElement | null>(null)
const scoreHeading = ref<HTMLHeadingElement | null>(null)
const countInput = ref<HTMLInputElement | null>(null)
const discardTrigger = ref<HTMLButtonElement | null>(null)
const cancelDiscard = ref<HTMLButtonElement | null>(null)
const attemptId = ref('')
const sessionTag = ref('')
const attempts = ref<SavedAttempt[]>([])
const historyPending = ref(false)
const historyLoaded = ref(false)
const historyFailed = ref(false)
const repeating = ref(false)
const repeatFailed = ref(false)
const saving = ref(false)
const saveFailed = ref(false)
const pendingSaves = ref<Record<string, AttemptPayload>>({})

const currentQuestion = computed(() => examQuestions.value[currentIndex.value] || null)
const currentSelection = computed(() => currentQuestion.value ? answersByQuestion.value[currentQuestion.value.id] || [] : [])
const multipleAnswers = computed(() => currentQuestion.value ? allowsMultipleAnswers(currentQuestion.value) : false)
const revealAnswers = computed(() => canRevealAnswers(sessionMode.value, submitted.value, currentSelection.value))
const feedbackStatus = computed(() => currentQuestion.value ? evaluateSelection(currentQuestion.value, currentSelection.value) : 'unanswered')
const feedbackMessage = computed(() => {
  if (feedbackStatus.value === 'correct') return answerFeedback(currentQuestion.value, true)
  if (feedbackStatus.value === 'incorrect') return answerFeedback(currentQuestion.value, false)
  if (feedbackStatus.value === 'partial') return submitted.value
    ? 'Respuesta incompleta: faltan opciones correctas.'
    : 'Vas bien: aún faltan opciones correctas.'
  return 'Sin responder.'
})
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
  if (!validCount.value || pending.value || inProgress.value || repeating.value) return
  beginSession(sampleQuestions(pool.value, desiredCount.value), mode.value)
}

function beginSession(questions: Question[], chosenMode: SessionMode, scroll = false) {
  if (!questions.length || inProgress.value) return
  examQuestions.value = [...questions]
  sessionMode.value = chosenMode
  sessionTag.value = selectedTag.value
  attemptId.value = crypto.randomUUID()
  answersByQuestion.value = {}
  currentIndex.value = 0
  started.value = true
  submitted.value = false
  discardRequested.value = false
  repeatFailed.value = false
  nextTick(() => questionHeading.value?.focus({ preventScroll: !scroll }))
}

function repeatCurrentExam() {
  if (!submitted.value || !examQuestions.value.length || repeating.value) return
  mode.value = sessionMode.value
  desiredCount.value = examQuestions.value.length
  selectedTag.value = sessionTag.value
  beginSession(examQuestions.value, sessionMode.value, true)
}

async function loadHistory(force = false) {
  if (historyPending.value || (historyLoaded.value && !force)) return
  historyPending.value = true
  historyFailed.value = false
  try {
    attempts.value = await api.listAttempts()
    historyLoaded.value = true
  } catch { historyFailed.value = true }
  finally { historyPending.value = false }
}

function openHistory(event: Event) {
  if ((event.target as HTMLDetailsElement).open) void loadHistory(true)
}

function formatAttempt(attempt: SavedAttempt) {
  return new Intl.DateTimeFormat(language.value, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(attempt.completedAt))
}

async function repeatSavedExam(attempt: SavedAttempt) {
  if (inProgress.value || repeating.value || pending.value) return
  repeating.value = true
  repeatFailed.value = false
  try {
    await refresh()
    if (error.value) throw error.value
    const questions = replayQuestions(allQuestions.value, attempt.questionIds, api.examId)
    if (!questions) throw new Error('Unavailable questions')
    mode.value = attempt.mode
    desiredCount.value = questions.length
    selectedTag.value = ''
    beginSession(questions, attempt.mode, true)
  } catch { repeatFailed.value = true }
  finally { repeating.value = false }
}

async function savePendingAttempts() {
  if (saving.value) return
  saving.value = true
  saveFailed.value = false
  try {
    // Keep each completion until acknowledged; retries reuse its ID and cannot duplicate it.
    while (Object.keys(pendingSaves.value).length) {
      const payload = Object.values(pendingSaves.value)[0]
      await api.saveAttempt(payload)
      delete pendingSaves.value[payload.id]
    }
    if (historyLoaded.value) await loadHistory(true)
  } catch { saveFailed.value = true }
  finally {
    saving.value = false
    // A new completion can arrive while the refreshed history is still loading.
    if (!saveFailed.value && Object.keys(pendingSaves.value).length) void savePendingAttempts()
  }
}

function discardExam() {
  if (!discardRequested.value || !inProgress.value) return
  started.value = false
  submitted.value = false
  examQuestions.value = []
  answersByQuestion.value = {}
  currentIndex.value = 0
  discardRequested.value = false
  nextTick(() => countInput.value?.focus())
}

function requestDiscard() {
  discardRequested.value = true
  nextTick(() => cancelDiscard.value?.focus())
}

function keepExam() {
  discardRequested.value = false
  nextTick(() => discardTrigger.value?.focus())
}

function submitExam() {
  if (!inProgress.value) return
  submitted.value = true
  pendingSaves.value[attemptId.value] = { id: attemptId.value, examId: api.examId,
    mode: sessionMode.value, questionIds: examQuestions.value.map(question => question.id) }
  void savePendingAttempts()
  nextTick(() => scoreHeading.value?.focus())
}

function toggleAnswer(question: Question, answerId: number | undefined, checked: boolean) {
  if (!answerId || submitted.value) {
    return
  }

  answersByQuestion.value = {
    ...answersByQuestion.value,
    [question.id]: selectAnswer(question, answersByQuestion.value[question.id] || [], answerId, checked)
  }
}

function isQuestionCorrect(question: Question) {
  return evaluateSelection(question, answersByQuestion.value[question.id] || []) === 'correct'
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
  <div class="stack reading-page">
    <ExamHeading :exam-id="api.examId" />
    <div v-if="saveFailed" class="banner warning" role="alert">
      {{ t('No se pudo guardar el simulacro en tu historial. Puedes repetir el actual sin salir de esta página.') }}
      <button class="btn ghost small" type="button" :disabled="saving" @click="savePendingAttempts">{{ t('Reintentar guardado') }}</button>
    </div>
    <div v-if="repeatFailed" class="banner warning" role="alert">{{ t('No se pudo repetir el simulacro. Revisa la conexión; si se borró o movió alguna pregunta, ya no se puede repetir completo.') }}</div>
    <div v-if="pending" class="banner" role="status">{{ t('Cargando preguntas...') }}</div>
    <div v-if="error" class="banner warning" role="alert">
      {{ t('No se pudieron cargar las preguntas.') }}
      <button class="btn ghost small" type="button" :disabled="pending" @click="refresh()">{{ t('Reintentar') }}</button>
    </div>
    <section class="panel exam-settings">
      <div class="section-title">
        <div>
          <h2>{{ t('Simulacro') }}</h2>
          <p v-if="started" class="session-mode-label">{{ t(sessionMode === 'practice' ? 'Simulacro normal: solución inmediata' : 'Examen real: soluciones al finalizar') }}</p>
          <p v-if="!inProgress" class="muted">{{ t('Elige cuántas preguntas quieres y genera un simulacro aleatorio, sin repeticiones.') }}</p>
        </div>
        <p class="muted" role="status" aria-live="polite">{{ inProgress ? t('{count} preguntas', { count: examQuestions.length }) : t(pool.length === 1 ? '1 pregunta disponible' : '{count} preguntas disponibles', { count: pool.length }) }}</p>
      </div>

      <fieldset v-show="!inProgress" class="mode-picker" :disabled="inProgress || repeating">
        <legend>{{ t('Modo de sesión') }}</legend>
        <label class="mode-option" :class="{ selected: mode === 'practice' }">
          <input v-model="mode" type="radio" name="session-mode" value="practice">
          <span><strong>{{ t('Simulacro normal') }}</strong><small>{{ t('Comprueba cada respuesta al seleccionarla.') }}</small></span>
        </label>
        <label class="mode-option" :class="{ selected: mode === 'exam' }">
          <input v-model="mode" type="radio" name="session-mode" value="exam">
          <span><strong>{{ t('Examen real') }}</strong><small>{{ t('Sin pistas. Las soluciones se muestran solo al terminar.') }}</small></span>
        </label>
      </fieldset>

      <div v-show="!inProgress" class="field-grid">
        <div class="field">
          <label for="tag">{{ t('Etiqueta') }}</label>
          <select id="tag" v-model="selectedTag" :disabled="inProgress || repeating">
            <option value="">{{ t('Todas ({count})', { count: allQuestions.length }) }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }} ({{ tag.count }})</option>
          </select>
        </div>

        <div class="field">
          <label for="count">{{ t('Número de preguntas del simulacro') }}</label>
          <input
            id="count"
            ref="countInput"
            v-model.number="desiredCount"
            min="1"
            :max="pool.length || 1"
            type="number"
            step="1"
            :aria-describedby="!validCount && pool.length ? 'count-help count-error' : 'count-help'"
            :aria-invalid="pool.length > 0 && !validCount"
            :disabled="inProgress || repeating"
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
        <button v-if="!inProgress" class="btn primary" type="button" :disabled="pending || repeating || !validCount" @click="startExam">
          {{ t(started ? 'Crear otro simulacro aleatorio' : 'Crear simulacro aleatorio') }}
        </button>
        <button v-if="!inProgress" class="btn ghost" type="button" :disabled="pending || repeating" @click="refresh()">{{ t('Actualizar preguntas') }}</button>
        <button
          class="btn ghost"
          v-if="!inProgress"
          type="button"
          :disabled="pending || repeating || !pool.length || inProgress"
          @click="desiredCount = pool.length"
        >
          {{ t('Usar todas ({count})', { count: pool.length }) }}
        </button>

        <button v-if="inProgress" ref="discardTrigger" class="btn ghost" type="button" :aria-expanded="discardRequested" aria-controls="discard-confirmation" @click="requestDiscard">{{ t('Descartar simulacro') }}</button>
      </div>
      <div v-if="inProgress && discardRequested" id="discard-confirmation" class="banner warning" role="alert" style="margin-top: 1rem;">
        <p>{{ t('Se perderán las respuestas de este simulacro. ¿Descartarlo y cambiar la configuración?') }}</p>
        <div class="actions">
          <button ref="cancelDiscard" class="btn ghost" type="button" @click="keepExam">{{ t('Cancelar') }}</button>
          <button class="btn danger" type="button" @click="discardExam">{{ t('Descartar y cambiar configuración') }}</button>
        </div>
      </div>
      <p v-if="!inProgress && validCount" class="muted">
        {{ t('Se elegirán {count} preguntas al azar del filtro seleccionado. Cada nuevo simulacro vuelve a sortearlas.', { count: desiredCount }) }}
      </p>
      <p v-if="!pending && !error && !pool.length" class="empty-state">{{ t('No hay preguntas para este examen y filtro. Añádelas desde Preguntas.') }}</p>
    </section>

    <section v-if="started && currentQuestion" class="panel session-card">
      <div class="session-controls" role="group" :aria-label="t('Navegación de preguntas')">
        <button class="btn ghost" type="button" :disabled="currentIndex === 0" @click="currentIndex -= 1">{{ t('Anterior') }}</button>
        <button v-if="!submitted" class="btn primary" type="button" @click="submitExam">{{ t(sessionMode === 'practice' ? 'Terminar práctica' : 'Finalizar examen') }}</button>
        <span v-else class="session-position">{{ currentIndex + 1 }} / {{ examQuestions.length }}</span>
        <button class="btn ghost" type="button" :disabled="currentIndex === examQuestions.length - 1" @click="currentIndex += 1">{{ t('Siguiente') }}</button>
      </div>
      <img
        v-if="currentQuestion.imageUrl"
        class="question-image"
        :src="currentQuestion.imageUrl"
        :alt="t('Imagen de apoyo para la pregunta')"
      >

      <div class="section-title">
        <div>
          <p class="muted" aria-live="polite">{{ t('Pregunta {current} de {total}', { current: currentIndex + 1, total: examQuestions.length }) }}</p>
          <h2 :id="`question-title-${currentQuestion.id}`" ref="questionHeading" tabindex="-1">{{ currentQuestion.prompt }}</h2>
          <p class="muted answer-instructions">{{ t(multipleAnswers ? 'Puedes seleccionar varias respuestas.' : 'Selecciona una respuesta.') }}</p>
        </div>
      </div>

      <div class="choice-list" :role="multipleAnswers ? 'group' : 'radiogroup'" :aria-labelledby="`question-title-${currentQuestion.id}`">
        <label
          v-for="answer in currentQuestion.answers"
          :key="answer.id || answer.text"
          class="choice"
          :class="{
            correct: revealAnswers && answer.isCorrect,
            incorrect: revealAnswers && currentSelection.includes(answer.id || -1) && !answer.isCorrect
          }"
        >
          <input
            :type="multipleAnswers ? 'checkbox' : 'radio'"
            :name="`question-${currentQuestion.id}`"
            :disabled="submitted"
            :checked="(answersByQuestion[currentQuestion.id] || []).includes(answer.id || -1)"
            @change="toggleAnswer(currentQuestion, answer.id, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ answer.text }}<span v-if="revealAnswers && (answer.isCorrect || currentSelection.includes(answer.id || -1))" class="answer-status">{{ t(answerBadge(currentQuestion, answer.isCorrect)) }}</span></span>
        </label>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        <div v-if="revealAnswers" class="banner feedback-message" :class="{ success: feedbackStatus === 'correct', warning: feedbackStatus === 'incorrect' || (submitted && feedbackStatus !== 'correct') }">{{ t(feedbackMessage) }}</div>
      </div>
      <QuestionSolution v-if="revealAnswers" :question="currentQuestion" />
    </section>

    <section v-if="score" class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2 ref="scoreHeading" tabindex="-1">{{ t(sessionMode === 'practice' ? 'Resultado de la práctica' : 'Resultado final') }}</h2>
          <p class="muted">{{ t(sessionMode === 'practice' ? 'Resultado de tus selecciones actuales. Has podido consultar las soluciones y rectificar.' : 'Revisión rápida de aciertos y fallos.') }}</p>
        </div>
      </div>

      <div class="repeat-actions">
        <button class="btn primary" type="button" :disabled="repeating" @click="repeatCurrentExam">{{ t('Repetir este simulacro') }}</button>
        <p class="muted">{{ t('Mismas preguntas, mismo orden y mismo modo, con las respuestas en blanco.') }}</p>
        <p v-if="saving" class="muted" role="status">{{ t('Guardando simulacro en tu historial...') }}</p>
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
          <QuestionSolution :question="question" compact :show-note="false" />
        </article>
      </div>
    </section>

    <details v-if="!inProgress" class="panel attempt-history" @toggle="openHistory">
      <summary>{{ t('Mis últimos 20 simulacros') }}</summary>
      <div class="stack">
        <p class="muted">{{ t('Privados de tu cuenta. Solo se guardan los simulacros finalizados desde esta actualización.') }}</p>
        <p v-if="historyPending" class="muted" role="status">{{ t('Cargando historial...') }}</p>
        <div v-if="historyFailed" class="banner warning" role="alert">
          {{ t('No se pudo cargar el historial.') }}
          <button class="btn ghost small" type="button" :disabled="historyPending" @click="loadHistory(true)">{{ t('Reintentar') }}</button>
        </div>
        <p v-if="historyLoaded && !historyPending && !attempts.length" class="muted">{{ t('Todavía no has guardado ningún simulacro de este examen.') }}</p>
        <ol v-if="attempts.length" class="attempt-list">
          <li v-for="attempt in attempts" :key="attempt.id" class="attempt-row">
            <div>
              <strong>{{ t('{count} preguntas', { count: attempt.questionIds.length }) }}</strong>
              <p class="muted">{{ t(attempt.mode === 'practice' ? 'Simulacro normal' : 'Examen real') }} · <time :datetime="attempt.completedAt">{{ formatAttempt(attempt) }}</time></p>
            </div>
            <button class="btn ghost" type="button" :disabled="pending || repeating" :aria-label="t('Repetir simulacro del {date}', { date: formatAttempt(attempt) })" @click="repeatSavedExam(attempt)">{{ t('Repetir') }}</button>
          </li>
        </ol>
        <p v-if="repeating" class="muted" role="status">{{ t('Preparando el mismo simulacro...') }}</p>
        <p class="muted">{{ t('Al repetir desde el historial se usa la versión actual de las preguntas, sin sortear otras.') }}</p>
      </div>
    </details>
  </div>
</template>
