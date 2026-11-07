<script setup lang="ts">
defineProps<{ src: string }>()
const { t } = useLanguage()
</script>

<template>
  <a
    class="exam-diagram"
    :href="src"
    target="_blank"
    rel="noopener"
    :aria-label="t('Ver diagrama a tamaño completo (se abre en otra pestaña)')"
  >
    <img class="question-image" :src="src" :alt="t('Imagen de apoyo para la pregunta')">
    <span>{{ t('Ver diagrama a tamaño completo') }}</span>
  </a>
</template>

<style scoped>
.exam-diagram {
  display: block;
  margin-bottom: 1rem;
  color: var(--primary-strong);
  border-radius: 16px;
}

.question-image {
  margin-bottom: 0;
  object-position: center;
}

.exam-diagram span {
  display: flex;
  align-items: center;
  min-height: 44px;
  text-decoration: underline;
}
</style>
