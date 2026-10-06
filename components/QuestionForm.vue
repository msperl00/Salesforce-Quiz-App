<script setup lang="ts">
import type { Exam, Question, QuestionPayload } from '~/types/quiz'

const props = defineProps<{
  modelValue?: Question | null
  saving?: boolean
  exams?: Exam[]
}>()

const emit = defineEmits<{
  save: [payload: QuestionPayload]
  cancel: []
}>()

const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const imageInput = ref<HTMLInputElement | null>(null)
const imageError = ref('')

function createBlankAnswer() {
  return {
    text: '',
    isCorrect: false
  }
}

const form = reactive({
  examId: undefined as number | undefined,
  prompt: '',
  imageDataUrl: '',
  explanation: '',
  note: '',
  tagsText: '',
  answers: [createBlankAnswer(), createBlankAnswer()]
})

function resetForm(question?: Question | null) {
  if (!question) {
    form.examId = undefined
    form.prompt = ''
    form.imageDataUrl = ''
    form.explanation = ''
    form.note = ''
    form.tagsText = ''
    form.answers = [createBlankAnswer(), createBlankAnswer()]
    imageError.value = ''
    if (imageInput.value) imageInput.value.value = ''
    return
  }

  form.prompt = question.prompt
  form.examId = question.examId
  form.imageDataUrl = question.imageDataUrl
  form.explanation = question.explanation
  form.note = question.note
  form.tagsText = question.tags.map(tag => tag.name).join(', ')
  form.answers = question.answers.map(answer => ({
    text: answer.text,
    isCorrect: answer.isCorrect
  }))
  imageError.value = ''
  if (imageInput.value) imageInput.value.value = ''
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  imageError.value = ''

  if (!file) return

  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    imageError.value = 'Usa una imagen PNG, JPG, WEBP o GIF.'
    input.value = ''
    return
  }

  if (file.size > MAX_IMAGE_SIZE) {
    imageError.value = 'La imagen no puede superar los 2 MB.'
    input.value = ''
    return
  }

  try {
    form.imageDataUrl = await readFileAsDataUrl(file)
  } catch {
    imageError.value = 'No se pudo leer la imagen.'
    input.value = ''
  }
}

function removeImage() {
  form.imageDataUrl = ''
  imageError.value = ''
  if (imageInput.value) imageInput.value.value = ''
}

function onSubmit() {
  emit('save', {
    examId: form.examId,
    prompt: form.prompt,
    imageDataUrl: form.imageDataUrl,
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
        <div v-if="modelValue && exams?.length" class="field full">
          <label for="question-exam">Examen de esta pregunta</label>
          <select id="question-exam" v-model.number="form.examId">
            <option v-for="exam in exams" :key="exam.id" :value="exam.id">{{ exam.name }}</option>
          </select>
          <small class="muted">Puedes moverla a otro examen al guardar.</small>
        </div>
        <div class="field full">
          <label for="prompt">Pregunta</label>
          <textarea id="prompt" v-model="form.prompt" required />
        </div>

        <div class="field full">
          <label for="question-image">Imagen opcional</label>
          <input
            id="question-image"
            ref="imageInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="selectImage"
          >
          <small class="muted">PNG, JPG, WEBP o GIF. Máximo 2 MB.</small>
          <p v-if="imageError" class="form-error">{{ imageError }}</p>

          <div v-if="form.imageDataUrl" class="image-preview">
            <img :src="form.imageDataUrl" alt="Vista previa de la pregunta">
            <button class="btn danger small" type="button" @click="removeImage">Quitar imagen</button>
          </div>
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
