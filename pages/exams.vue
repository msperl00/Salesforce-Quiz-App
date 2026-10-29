<script setup lang="ts">
import type { Exam } from '~/types/quiz'
const { t } = useLanguage()
const { data: account } = await useAccount()

const { data, error, refresh } = await useFetch<{ exams: Exam[] }>('/api/exams')
const name = ref('')
const editingId = ref<number | null>(null)
const saving = ref(false)
const message = ref('')

function edit(exam: Exam) {
  editingId.value = exam.id
  name.value = exam.name
  message.value = ''
}

function reset() {
  editingId.value = null
  name.value = ''
}

async function save() {
  saving.value = true
  message.value = ''
  try {
    await $fetch(editingId.value ? `/api/exams/${editingId.value}` : '/api/exams', {
      method: editingId.value ? 'PUT' : 'POST',
      body: { name: name.value }
    })
    if (editingId.value) clearNuxtData(`exam-heading:${editingId.value}`)
    await refresh()
    reset()
  } catch (err: any) {
    message.value = err?.data?.statusMessage || 'No se pudo guardar el examen.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stack">
    <section class="panel exam-panel">
      <h2>{{ t('Mis exámenes') }}</h2>
      <p class="muted">{{ t('Elige qué certificación preparar. Cada examen tiene sus propias preguntas y temas.') }}</p>
      <form v-if="account?.user?.role === 'admin'" class="exam-form" @submit.prevent="save">
        <div class="field">
          <label for="exam-name">{{ t(editingId ? 'Renombrar examen' : 'Nuevo examen') }}</label>
          <input id="exam-name" v-model="name" required maxlength="120" :placeholder="t('Por ejemplo, Platform Developer I')" :disabled="saving">
        </div>
        <button class="btn primary" type="submit" :disabled="saving || !name.trim()">
          {{ t(saving ? 'Guardando...' : editingId ? 'Guardar nombre' : 'Crear examen') }}
        </button>
        <button v-if="editingId" class="btn ghost" type="button" :disabled="saving" @click="reset">{{ t('Cancelar') }}</button>
      </form>
      <p v-if="message" role="alert" class="form-error">{{ t(message) }}</p>
    </section>

    <div v-if="error" class="banner warning" role="alert">
      {{ t('No se pudieron cargar los exámenes.') }}
      <button class="btn ghost small" @click="refresh()">{{ t('Reintentar') }}</button>
    </div>
    <div class="exam-grid">
      <article v-for="exam in data?.exams" :key="exam.id" class="panel exam-panel stack">
        <div>
          <h2>{{ exam.name }}</h2>
          <p class="muted">{{ exam.questionCount }} {{ t(exam.questionCount === 1 ? 'pregunta' : 'preguntas') }}</p>
        </div>
        <div class="actions">
          <NuxtLink class="btn primary" :to="{ path: '/', query: { examId: exam.id } }">{{ t('Preguntas') }}</NuxtLink>
          <NuxtLink class="btn ghost" :to="{ path: '/study', query: { examId: exam.id } }">{{ t('Estudiar') }}</NuxtLink>
          <NuxtLink class="btn ghost" :to="{ path: '/exam', query: { examId: exam.id } }">{{ t('Simulacro') }}</NuxtLink>
          <button v-if="account?.user?.role === 'admin'" class="btn ghost small" :disabled="saving" @click="edit(exam)">{{ t('Renombrar') }}</button>
        </div>
      </article>
    </div>
    <p v-if="data && !data.exams.length" class="empty-state">{{ t('Crea tu primer examen para añadir preguntas.') }}</p>
  </div>
</template>
