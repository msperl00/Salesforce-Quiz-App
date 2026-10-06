<script setup lang="ts">
const props = defineProps<{ examId: number }>()
const { data, error } = await useFetch(`/api/exams/${props.examId}`)
if (error.value) throw createError({ statusCode: error.value.statusCode || 500, statusMessage: 'No se pudo abrir el examen.' })
</script>

<template>
  <section class="exam-heading">
    <div>
      <p class="eyebrow">Examen seleccionado</p>
      <h2>{{ data?.exam.name }}</h2>
    </div>
    <NuxtLink class="btn ghost small" to="/exams">Cambiar examen</NuxtLink>
  </section>
</template>
