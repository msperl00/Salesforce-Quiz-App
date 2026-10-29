<script setup lang="ts">
import { initialCachedData } from '~/utils/async-cache.mjs'

const props = defineProps<{ examId: number }>()
const { t } = useLanguage()
const { data, error } = await useFetch(`/api/exams/${props.examId}`, {
  key: `exam-heading:${props.examId}`,
  getCachedData: initialCachedData
})
if (error.value) throw createError({ statusCode: error.value.statusCode || 500, statusMessage: t('No se pudo abrir el examen.') })
</script>

<template>
  <section class="exam-heading">
    <div>
      <p class="eyebrow">{{ t('Examen seleccionado') }}</p>
      <h2>{{ data?.exam.name }}</h2>
    </div>
    <NuxtLink class="btn ghost small" to="/exams">{{ t('Cambiar examen') }}</NuxtLink>
  </section>
</template>
