<script setup lang="ts">
const route = useRoute()
const { data: account } = await useAccount()
async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', body: {} })
  window.location.assign('/login')
}
const examQuery = computed(() => ({ examId: route.query.examId }))
</script>

<template>
  <div class="app-shell">
    <NuxtLoadingIndicator color="#376a5b" />
    <header class="topbar">
      <div>
        <p class="eyebrow">Salesforce Quiz App</p>
        <h1>Estudio simple, local y fácil de mantener</h1>
      </div>

      <nav v-if="account?.user" class="nav">
        <NuxtLink to="/exams">Exámenes</NuxtLink>
        <template v-if="route.query.examId && route.path !== '/exams'">
          <NuxtLink :to="{ path: '/', query: examQuery }">Preguntas</NuxtLink>
          <NuxtLink :to="{ path: '/study', query: examQuery }">Estudiar</NuxtLink>
          <NuxtLink :to="{ path: '/exam', query: examQuery }">Simulacro</NuxtLink>
        </template>
        <NuxtLink v-if="account.enabled && account.user.role === 'admin'" to="/users">Invitar</NuxtLink>
        <button v-if="account.enabled" class="btn ghost small" @click="logout">Cerrar sesión</button>
      </nav>
    </header>

    <main class="page-wrap">
      <NuxtPage :page-key="page => `${page.path}:${page.query.examId || ''}`" />
    </main>
  </div>
</template>
