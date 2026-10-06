<script setup lang="ts">
const email = ref('')
const password = ref('')
const message = ref('')
const busy = ref(false)
async function login() {
  busy.value = true
  message.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    window.location.assign('/exams')
  } catch (err: any) { message.value = err?.data?.statusMessage || 'No se pudo iniciar sesión.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="panel exam-panel auth-panel">
    <h2>Iniciar sesión</h2>
    <p class="muted">Entra para preparar tus certificaciones.</p>
    <form class="stack" @submit.prevent="login">
      <div class="field"><label for="email">Correo</label><input id="email" v-model="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Contraseña</label><input id="password" v-model="password" type="password" autocomplete="current-password" required maxlength="128"></div>
      <p v-if="message" role="alert" class="form-error">{{ message }}</p>
      <button class="btn primary" :disabled="busy">{{ busy ? 'Entrando...' : 'Entrar' }}</button>
    </form>
    <p class="muted">Para crear una cuenta o recuperar el acceso, contacta con el administrador.</p>
  </section>
</template>
