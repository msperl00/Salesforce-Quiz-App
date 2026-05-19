<script setup lang="ts">
import type { Question, Tag } from '~/types/quiz'

const api = useQuizApi()

const allQuestions = ref<Question[]>(await api.listQuestions())
const tags = ref<Tag[]>(await api.listTags())
const selectedTag = ref('')
const currentIndex = ref(0)
const reveal = ref(false)
const shuffleMode = ref(false)
const studyQuestions = ref<Question[]>([])

function rebuildStudyQuestions() {
  const base = selectedTag.value
    ? allQuestions.value.filter(question => question.tags.some(tag => tag.name === selectedTag.value))
    : allQuestions.value

  studyQuestions.value = shuffleMode.value
    ? [...base].sort(() => Math.random() - 0.5)
    : base

  currentIndex.value = 0
  reveal.value = false
}

const currentQuestion = computed(() => studyQuestions.value[currentIndex.value] || null)

watch([selectedTag, shuffleMode], rebuildStudyQuestions)
rebuildStudyQuestions()

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
    <section class="panel" style="padding: 1.25rem;">
      <div class="section-title">
        <div>
          <h2>Modo estudio</h2>
          <p class="muted">Repaso libre con explicación visible solo cuando quieras.</p>
        </div>
        <p class="muted">{{ studyQuestions.length }} preguntas disponibles</p>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="tag">Filtrar por etiqueta</label>
          <select id="tag" v-model="selectedTag">
            <option value="">Todas</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.name">{{ tag.name }}</option>
          </select>
        </div>

        <div class="field">
          <label class="inline" style="margin-top: 2rem;">
            <input v-model="shuffleMode" type="checkbox">
            Mezclar preguntas
          </label>
        </div>
      </div>
    </section>

    <section v-if="currentQuestion" class="study-card panel">
      <div class="section-title">
        <div>
          <p class="muted">Pregunta {{ currentIndex + 1 }} de {{ studyQuestions.length }}</p>
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
          <strong>{{ reveal && answer.isCorrect ? 'OK' : '?' }}</strong>
          <span>{{ answer.text }}</span>
        </div>
      </div>

      <div v-if="currentQuestion.tags.length" class="tags">
        <span v-for="tag in currentQuestion.tags" :key="tag.id" class="tag">{{ tag.name }}</span>
      </div>

      <div v-if="reveal" class="stack" style="margin-top: 1rem;">
        <div v-if="currentQuestion.explanation" class="banner success">
          <strong>Explicación:</strong> {{ currentQuestion.explanation }}
        </div>
        <div v-if="currentQuestion.note" class="banner warning">
          <strong>Nota:</strong> {{ currentQuestion.note }}
        </div>
      </div>

      <div class="actions" style="margin-top: 1rem;">
        <button class="btn ghost" type="button" @click="previousQuestion">Anterior</button>
        <button class="btn primary" type="button" @click="reveal = !reveal">
          {{ reveal ? 'Ocultar solución' : 'Mostrar solución' }}
        </button>
        <button class="btn ghost" type="button" @click="nextQuestion">Siguiente</button>
      </div>
    </section>

    <div v-else class="empty-state">
      No hay preguntas para el filtro actual.
    </div>
  </div>
</template>
