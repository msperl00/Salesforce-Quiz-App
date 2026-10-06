<script setup lang="ts">
const route = useRoute()
const examQuery = computed(() => ({ examId: route.query.examId }))
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Salesforce Quiz App</p>
        <h1>Estudio simple, local y fácil de mantener</h1>
      </div>

      <nav class="nav">
        <NuxtLink to="/exams">Exámenes</NuxtLink>
        <template v-if="route.query.examId && route.path !== '/exams'">
          <NuxtLink :to="{ path: '/', query: examQuery }">Preguntas</NuxtLink>
          <NuxtLink :to="{ path: '/study', query: examQuery }">Estudiar</NuxtLink>
          <NuxtLink :to="{ path: '/exam', query: examQuery }">Simulacro</NuxtLink>
        </template>
      </nav>
    </header>

    <main class="page-wrap">
      <NuxtPage :page-key="page => `${page.path}:${page.query.examId || ''}`" />
    </main>
  </div>
</template>
