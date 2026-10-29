<script setup lang="ts">
import type { Question, Tag } from '~/types/quiz'
import { questionTags, shuffledQuestions } from '~/utils/quiz.mjs'

const api = useQuizApi()
const { t } = useLanguage()

const { data: allQuestions, pending, error, refresh } = await useQuestionBank(api)
const tags = computed<Tag[]>(() => questionTags(allQuestions.value))
const selectedTag = ref('')
const currentIndex = ref(0)
const reveal = ref(false)
const shuffleMode = ref(false)
const studyQuestions = ref<Question[]>([])

function rebuildStudyQuestions() {
  const filtered = selectedTag.value
    ? allQuestions.value.filter(question => question.tags.some(tag => tag.name === selectedTag.value))
    : allQuestions.value
  const base = [...filtered].sort((a, b) => a.id - b.id)

  studyQuestions.value = shuffleMode.value
    ? shuffledQuestions(base)
    : base

  currentIndex.value = 0
  reveal.value = false
}

const currentQuestion = computed(() => studyQuestions.value[currentIndex.value] || null)

watch([allQuestions, selectedTag, shuffleMode], rebuildStudyQuestions, { immediate: true })

function nextQuestion() {
  if (!studyQuestions.value.length) {
    return
  }

  currentIndex.value = (currentIndex.value + 1) % studyQuestions.value.length
  reveal.value = false
}

function previousQuestion() {
  if (!studyQuestions.value.length) {
    return
  }

  currentIndex.value = (currentIndex.value - 1 + studyQuestions.value.length) % studyQuestions.value.length
  reveal.value = false
}
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
          <h2>{{ t('Modo estudio') }}</h2>
          <p class="muted">{{ t('Repaso libre con explicación visible solo cuando quieras.') }}</p>
        </div>
        <div class="inline-actions">
          <p class="muted">{{ t(studyQuestions.length === 1 ? '1 pregunta disponible' : '{count} preguntas disponibles', { count: studyQuestions.length }) }}</p>
          <button class="btn ghost small" type="button" :disabled="pending" @click="refresh()">{{ t('Actualizar preguntas') }}</button>
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="tag">{{ t('Filtrar por etiqueta') }}</label>
          <select id="tag" v-model="selectedTag">
            <option value="">{{ t('Todas') }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }}</option>
          </select>
        </div>

        <div class="field checkbox-field">
          <label class="inline">
            <input v-model="shuffleMode" type="checkbox">
            {{ t('Mezclar preguntas') }}
          </label>
        </div>
      </div>
    </section>

    <section v-if="currentQuestion" class="study-card panel">
      <div class="study-controls" role="group" :aria-label="t('Navegación de preguntas')">
        <button class="btn ghost" type="button" @click="previousQuestion">{{ t('Anterior') }}</button>
        <button class="btn primary" type="button" @click="reveal = !reveal">
          {{ t(reveal ? 'Ocultar solución' : 'Mostrar solución') }}
        </button>
        <button class="btn ghost" type="button" @click="nextQuestion">{{ t('Siguiente') }}</button>
      </div>
      <img
        v-if="currentQuestion.imageUrl"
        class="question-image"
        :src="currentQuestion.imageUrl"
        :alt="t('Imagen de apoyo para la pregunta')"
      >

      <div class="section-title">
        <div>
          <p class="muted" aria-live="polite">{{ t('Pregunta {current} de {total}', { current: currentIndex + 1, total: studyQuestions.length }) }}</p>
          <h2>{{ currentQuestion.prompt }}</h2>
        </div>
      </div>

      <div class="choice-list">
        <div
          v-for="answer in currentQuestion.answers"
          :key="answer.id || answer.text"
          class="choice"
          :class="{ correct: reveal && answer.isCorrect }"
        >
          <strong>{{ reveal && answer.isCorrect ? t('OK') : '?' }}</strong>
          <span>{{ answer.text }}</span>
        </div>
      </div>

      <div v-if="currentQuestion.tags.length" class="tags">
        <span v-for="tag in currentQuestion.tags" :key="tag.id" class="tag">{{ tag.name }}</span>
      </div>

      <div v-if="reveal" class="stack" style="margin-top: 1rem;">
        <div v-if="currentQuestion.explanation" class="banner success">
          <strong>{{ t('Explicación:') }}</strong> {{ currentQuestion.explanation }}
        </div>
        <div v-if="currentQuestion.note" class="banner warning">
          <strong>{{ t('Nota:') }}</strong> {{ currentQuestion.note }}
        </div>
      </div>

    </section>

    <div v-else-if="!pending && !error" class="empty-state">
      {{ t('No hay preguntas para el filtro actual.') }}
    </div>
  </div>
</template>
