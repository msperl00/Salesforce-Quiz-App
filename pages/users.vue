<script setup lang="ts">
const email = ref('')
const link = ref('')
const message = ref('')
const busy = ref(false)
const { data: account } = await useAccount()
async function invite() {
  busy.value = true
  message.value = ''
  link.value = ''
  try {
    const result = await $fetch('/api/admin/invitations', { method: 'POST', body: { email: email.value } })
    link.value = window.location.origin + result.path
  } catch (err: any) { message.value = err?.data?.statusMessage || 'No se pudo crear la invitación.' }
  finally { busy.value = false }
}
</script>
<template>
  <section v-if="account?.user?.role === 'admin'" class="panel exam-panel auth-panel">
    <h2>Invitar a un amigo</h2>
    <p class="muted">Podrá consultar el banco compartido, estudiar y hacer simulacros. Solo tú administras las preguntas.</p>
    <form class="stack" @submit.prevent="invite">
      <div class="field"><label for="email">Correo del invitado</label><input id="email" v-model="email" type="email" required></div>
      <button class="btn primary" :disabled="busy">Crear enlace de invitación</button>
      <p v-if="message" class="form-error" role="alert">{{ message }}</p>
      <div v-if="link" class="field"><label for="invite-link">Comparte este enlace en privado. Caduca en 48 horas.</label><textarea id="invite-link" :value="link" readonly /></div>
    </form>
  </section>
  <p v-else>Esta sección es solo para el administrador.</p>
</template>
