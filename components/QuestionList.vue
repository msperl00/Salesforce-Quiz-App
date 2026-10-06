<script setup lang="ts">
import type { Question } from '~/types/quiz'

defineProps<{
  questions: Question[]
}>()

const emit = defineEmits<{
  edit: [question: Question]
  remove: [question: Question]
}>()
</script>

<template>
  <section class="panel" style="padding: 1.25rem;">
    <div class="section-title">
      <div>
        <h2>Banco de preguntas</h2>
        <p class="muted">Edición directa, sin pantallas extra.</p>
      </div>

      <p class="muted">{{ questions.length }} total</p>
    </div>

    <div v-if="questions.length" class="question-list">
      <article v-for="question in questions" :key="question.id" class="question-card">
        <img
          v-if="question.imageDataUrl"
          class="question-image compact"
          :src="question.imageDataUrl"
          alt="Imagen de apoyo para la pregunta"
        >

        <div class="question-header">
          <div class="stack" style="gap: 0.4rem;">
            <h3>{{ question.prompt }}</h3>
            <p class="muted">
              {{ question.answers.filter(answer => answer.isCorrect).length }} correcta(s)
            </p>
          </div>

          <div class="inline-actions">
            <button class="btn small ghost" type="button" @click="emit('edit', question)">Editar</button>
            <button class="btn small danger" type="button" @click="emit('remove', question)">Borrar</button>
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

        <p v-if="question.explanation" class="muted" style="margin-bottom: 0;">
          {{ question.explanation }}
        </p>
      </article>
    </div>

    <div v-else class="empty-state">
      No hay preguntas todavía. Crea la primera desde el panel de la izquierda.
    </div>
  </section>
</template>
