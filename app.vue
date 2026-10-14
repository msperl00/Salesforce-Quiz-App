<script setup lang="ts">
const route = useRoute()
const { language, setLanguage, t } = useLanguage()
useHead(() => ({ htmlAttrs: { lang: language.value } }))
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
        <h1>{{ t('Estudio simple, local y fácil de mantener') }}</h1>
      </div>

      <div class="header-controls">
        <div class="field language-switch">
          <label for="interface-language">{{ t('Idioma') }}</label>
          <select id="interface-language" :value="language" @change="setLanguage(($event.target as HTMLSelectElement).value)">
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </div>
        <nav v-if="account?.user" class="nav">
          <NuxtLink to="/exams">{{ t('Exámenes') }}</NuxtLink>
          <template v-if="route.query.examId && route.path !== '/exams'">
            <NuxtLink :to="{ path: '/', query: examQuery }">{{ t('Preguntas') }}</NuxtLink>
            <NuxtLink :to="{ path: '/study', query: examQuery }">{{ t('Estudiar') }}</NuxtLink>
            <NuxtLink :to="{ path: '/exam', query: examQuery }">{{ t('Simulacro') }}</NuxtLink>
          </template>
          <NuxtLink v-if="account.enabled && account.user.role === 'admin'" to="/users">{{ t('Invitar') }}</NuxtLink>
          <button v-if="account.enabled" class="btn ghost small" @click="logout">{{ t('Cerrar sesión') }}</button>
        </nav>
      </div>
    </header>

    <main class="page-wrap">
      <NuxtPage :page-key="page => `${page.path}:${page.query.examId || ''}`" />
    </main>
  </div>
</template>
