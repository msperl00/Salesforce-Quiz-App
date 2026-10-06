<script setup lang="ts">
const email = ref('')
const password = ref('')
const message = ref('')
const busy = ref(false)
async function register() {
  busy.value = true
  message.value = ''
  try {
    await $fetch('/api/auth/register', { method: 'POST', body: { email: email.value, password: password.value, token: window.location.hash.slice(1) } })
    window.location.replace('/exams')
  } catch (err: any) { message.value = err?.data?.statusMessage || 'No se pudo crear la cuenta.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="panel exam-panel auth-panel">
    <h2>Aceptar invitación</h2>
    <p class="muted">Usa el correo al que te han invitado. El enlace caduca a las 48 horas.</p>
    <form class="stack" @submit.prevent="register">
      <div class="field"><label for="email">Correo</label><input id="email" v-model="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Contraseña (mínimo 12 caracteres)</label><input id="password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
      <p v-if="message" role="alert" class="form-error">{{ message }}</p>
      <button class="btn primary" :disabled="busy">Crear mi cuenta</button>
    </form>
  </section>
</template>
