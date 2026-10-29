<script setup lang="ts">
import type { Question } from '~/types/quiz'
const { t } = useLanguage()

const props = defineProps<{
  questions: Question[]
  canEdit?: boolean
  busy?: boolean
}>()

const page = ref(1)
const listHeading = ref<HTMLHeadingElement | null>(null)
const pageSize = 25
const pageCount = computed(() => Math.max(1, Math.ceil(props.questions.length / pageSize)))
const visibleQuestions = computed(() => props.questions.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(() => props.questions, () => { page.value = 1 })
function changePage(direction: number) {
  page.value = Math.min(pageCount.value, Math.max(1, page.value + direction))
  nextTick(() => listHeading.value?.focus())
}

const emit = defineEmits<{
  edit: [question: Question]
  remove: [question: Question]
}>()
</script>

<template>
  <section class="panel" style="padding: 1.25rem;">
    <div class="section-title">
      <div>
        <h2 ref="listHeading" tabindex="-1">{{ t('Banco de preguntas') }}</h2>
        <p class="muted">{{ t('Edición directa, sin pantallas extra.') }}</p>
      </div>

      <p class="muted">{{ t('{count} total', { count: questions.length }) }}</p>
    </div>

    <div v-if="questions.length" class="question-list">
      <article v-for="question in visibleQuestions" :key="question.id" class="question-card">
        <img
          v-if="question.imageUrl"
          class="question-image compact"
          :src="question.imageUrl"
          loading="lazy"
          :alt="t('Imagen de apoyo para la pregunta')"
        >

        <div class="question-header">
          <div class="stack" style="gap: 0.4rem;">
            <h3>{{ question.prompt }}</h3>
            <p class="muted">
              {{ t('{count} correcta(s)', { count: question.answers.filter(answer => answer.isCorrect).length }) }}
            </p>
          </div>

          <div v-if="canEdit" class="inline-actions">
            <button class="btn small ghost" type="button" :disabled="busy" :aria-label="t('Editar pregunta: {prompt}', { prompt: question.prompt })" @click="emit('edit', question)">{{ t('Editar') }}</button>
            <button class="btn small danger" type="button" :disabled="busy" :aria-label="t('Borrar pregunta: {prompt}', { prompt: question.prompt })" @click="emit('remove', question)">{{ t('Borrar') }}</button>
          </div>
        </div>

        <div class="choice-list" style="margin-bottom: 0;">
          <div
            v-for="answer in question.answers"
            :key="answer.id || answer.text"
            class="choice"
            :class="{ correct: answer.isCorrect }"
          >
            <strong>{{ answer.isCorrect ? 'OK' : '-' }}</strong>
            <span>{{ answer.text }}</span>
          </div>
        </div>

        <div v-if="question.tags.length" class="tags">
          <span v-for="tag in question.tags" :key="tag.id" class="tag">{{ tag.name }}</span>
        </div>

        <p v-if="question.explanation" class="muted solution-text" style="margin-bottom: 0;">
          {{ question.explanation }}
        </p>
      </article>
    </div>

    <div v-if="questions.length > pageSize" class="actions" style="margin-top: 1rem;">
      <button class="btn ghost" type="button" :disabled="page === 1 || busy" @click="changePage(-1)">{{ t('Anterior') }}</button>
      <span class="muted" aria-live="polite">{{ t('Pagina {current} de {total}', { current: page, total: pageCount }) }}</span>
      <button class="btn ghost" type="button" :disabled="page === pageCount || busy" @click="changePage(1)">{{ t('Siguiente') }}</button>
    </div>

    <div v-if="!questions.length" class="empty-state">
      {{ t('No hay preguntas todavía. Crea la primera desde el panel de la izquierda.') }}
    </div>
  </section>
</template>
