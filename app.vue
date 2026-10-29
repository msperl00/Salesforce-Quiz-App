<script setup lang="ts">
import { focusMovedOutside } from '~/utils/focus.mjs'

const route = useRoute()
const { language, setLanguage, t } = useLanguage()
const pageNames: Record<string, string> = { '/': 'Preguntas', '/study': 'Estudiar', '/exam': 'Simulacro', '/exams': 'Exámenes', '/login': 'Iniciar sesión', '/register': 'Aceptar invitación', '/users': 'Invitar' }
useHead(() => ({
  htmlAttrs: { lang: language.value },
  title: `${t(pageNames[route.path] || 'Exámenes')} | Salesforce Quiz`
}))
const { data: account } = await useAccount()
const accountMenu = ref<HTMLDetailsElement | null>(null)
function closeAccountMenu() {
  accountMenu.value?.removeAttribute('open')
  accountMenu.value?.querySelector('summary')?.focus()
}
function leaveAccountMenu(event: FocusEvent) {
  const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null
  if (focusMovedOutside(accountMenu.value, nextTarget)) {
    accountMenu.value?.removeAttribute('open')
  }
}
watch(() => route.fullPath, () => accountMenu.value?.removeAttribute('open'))
async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', body: {} })
  window.location.assign('/login')
}
const examQuery = computed(() => ({ examId: route.query.examId }))
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">{{ t('Saltar al contenido') }}</a>
    <NuxtLoadingIndicator color="#376a5b" />
    <header class="topbar">
      <NuxtLink class="brand" to="/exams">
        <img src="/favicon.svg" width="40" height="40" alt="">
        <div>
          <h1>Salesforce Quiz</h1>
          <p class="muted">{{ t('Aprende a tu ritmo') }}</p>
        </div>
      </NuxtLink>

      <div class="header-tools">
        <div class="field language-switch">
          <label class="sr-only" for="interface-language">{{ t('Idioma') }}</label>
          <select id="interface-language" :value="language" @change="setLanguage(($event.target as HTMLSelectElement).value)">
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="it">Italiano</option>
          </select>
        </div>
        <details v-if="account?.enabled && account.user" ref="accountMenu" class="account-menu" @keydown.esc.prevent="closeAccountMenu" @focusout="leaveAccountMenu">
          <summary :aria-label="t('Cuenta')">
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </svg>
            <span class="account-label">{{ t('Cuenta') }}</span>
          </summary>
          <div class="account-popover">
            <NuxtLink v-if="account.user.role === 'admin'" to="/users">{{ t('Invitar') }}</NuxtLink>
            <button type="button" @click="logout">{{ t('Cerrar sesión') }}</button>
          </div>
        </details>
      </div>
    </header>

    <nav v-if="account?.user && route.path !== '/exams'" class="nav" :aria-label="t('Navegación principal')">
      <NuxtLink to="/exams">{{ t('Exámenes') }}</NuxtLink>
      <template v-if="route.query.examId">
        <NuxtLink :to="{ path: '/', query: examQuery }">{{ t('Preguntas') }}</NuxtLink>
        <NuxtLink :to="{ path: '/study', query: examQuery }">{{ t('Estudiar') }}</NuxtLink>
        <NuxtLink :to="{ path: '/exam', query: examQuery }">{{ t('Simulacro') }}</NuxtLink>
      </template>
    </nav>

    <main id="main-content" class="page-wrap" tabindex="-1">
      <NuxtPage :page-key="page => `${page.path}:${page.query.examId || ''}`" />
    </main>
  </div>
</template>
