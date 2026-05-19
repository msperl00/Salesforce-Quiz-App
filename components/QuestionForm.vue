<script setup lang="ts">
import type { Question, QuestionPayload } from '~/types/quiz'

const props = defineProps<{
  modelValue?: Question | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [payload: QuestionPayload]
  cancel: []
}>()

function createBlankAnswer() {
  return {
    text: '',
    isCorrect: false
  }
}

const form = reactive({
  prompt: '',
  explanation: '',
  note: '',
  tagsText: '',
  answers: [createBlankAnswer(), createBlankAnswer()]
})

function resetForm(question?: Question | null) {
  if (!question) {
    form.prompt = ''
    form.explanation = ''
    form.note = ''
    form.tagsText = ''
    form.answers = [createBlankAnswer(), createBlankAnswer()]
    return
  }

  form.prompt = question.prompt
  form.explanation = question.explanation
  form.note = question.note
  form.tagsText = question.tags.map(tag => tag.name).join(', ')
  form.answers = question.answers.map(answer => ({
    text: answer.text,
    isCorrect: answer.isCorrect
  }))
}

watch(() => props.modelValue, (value) => {
  resetForm(value)
}, { immediate: true })

function addAnswer() {
  form.answers.push(createBlankAnswer())
}

function removeAnswer(index: number) {
  if (form.answers.length <= 2) {
    return
  }

  form.answers.splice(index, 1)
}

function onSubmit() {
  emit('save', {
    prompt: form.prompt,
    explanation: form.explanation,
    note: form.note,
    tags: form.tagsText.split(',').map(tag => tag.trim()).filter(Boolean),
    answers: form.answers
  })
}
</script>

<template>
  <section class="panel" style="padding: 1.25rem;">
    <div class="section-title">
      <div>
        <h2>{{ modelValue ? 'Editar pregunta' : 'Nueva pregunta' }}</h2>
        <p class="muted">Una sola pantalla para crear y mantener el banco de preguntas.</p>
      </div>

      <button
        v-if="modelValue"
        class="btn ghost small"
        type="button"
        @click="emit('cancel')"
      >
        Cancelar edición
      </button>
    </div>

    <form class="stack" @submit.prevent="onSubmit">
      <div class="field-grid">
        <div class="field full">
          <label for="prompt">Pregunta</label>
          <textarea id="prompt" v-model="form.prompt" required />
        </div>

        <div class="field">
          <label for="tags">Etiquetas</label>
          <input
            id="tags"
            v-model="form.tagsText"
            type="text"
            placeholder="Admin, Security, Flows"
          />
        </div>

        <div class="field">
          <label for="note">Nota rápida</label>
          <input
            id="note"
            v-model="form.note"
            type="text"
            placeholder="Mnemotecnia o recordatorio"
          />
        </div>

        <div class="field full">
          <label for="explanation">Explicación</label>
          <textarea
            id="explanation"
            v-model="form.explanation"
            placeholder="Por qué la respuesta correcta es la válida"
          />
        </div>
      </div>

      <div class="stack">
        <div class="section-title">
          <h3>Respuestas</h3>
          <button class="btn small ghost" type="button" @click="addAnswer">Añadir respuesta</button>
        </div>

        <div class="answers-list">
          <div v-for="(answer, index) in form.answers" :key="index" class="answer-row">
            <input
              v-model="answer.text"
              :aria-label="`Respuesta ${index + 1}`"
              required
              type="text"
              placeholder="Texto de la respuesta"
            />

            <label class="inline">
              <input v-model="answer.isCorrect" type="checkbox">
              Correcta
            </label>

            <button
              class="btn danger small"
              type="button"
              :disabled="form.answers.length <= 2"
              @click="removeAnswer(index)"
            >
              Quitar
            </button>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">
          {{ saving ? 'Guardando...' : modelValue ? 'Guardar cambios' : 'Crear pregunta' }}
        </button>
        <button class="btn ghost" type="button" @click="resetForm(modelValue)">
          Resetear
        </button>
      </div>
    </form>
  </section>
</template>
