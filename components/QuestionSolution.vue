<script setup lang="ts">
import type { Question } from '~/types/quiz'
import { pdfSolution } from '~/utils/pdf-solution.mjs'

const props = withDefaults(defineProps<{ question: Question, compact?: boolean, showNote?: boolean }>(), { compact: false, showNote: true })
const { t } = useLanguage()
const source = computed(() => pdfSolution(props.question))
</script>

<template>
  <div v-if="source?.consistent" class="stack pdf-solution">
    <div class="banner success">
      <strong>{{ t('Respuesta según el PDF:') }}</strong>
      <p class="pdf-key">{{ source.letter }}) {{ source.answer }}</p>
      <p class="muted pdf-reference">{{ t('Solucionario aportado · página {page}', { page: source.page }) }}</p>
      <div v-if="source.learning && !source.hasCaveat" class="pdf-learning solution-text">
        <strong>{{ t('Para recordarlo:') }}</strong>
        <p>{{ source.learning }}</p>
      </div>
    </div>
    <div v-if="source.hasCaveat" class="banner warning pdf-key-notice">
      {{ t('Se conserva la clave del PDF. La aclaración no cambia la respuesta que puntúa y no debe usarse como consejo sanitario o legal.') }}
    </div>
    <details :key="question.id" class="pdf-source-details">
      <summary>{{ t('Aclaraciones y notas (no cambian la clave del PDF)') }}</summary>
      <div class="stack">
        <p v-if="source.hasCaveat && source.learning" class="solution-text">{{ source.learning }}</p>
        <div v-if="source.original" class="solution-text">
          <strong>{{ t('Texto original de la explicación:') }}</strong>
          <p>{{ source.original }}</p>
        </div>
        <div v-if="question.note" class="solution-text">
          <strong>{{ t('Nota:') }}</strong>
          <p>{{ question.note }}</p>
        </div>
      </div>
    </details>
  </div>
  <div v-else-if="source || question.explanation || (showNote && question.note)" class="stack">
    <div v-if="source && !source.consistent" class="banner warning" role="alert">{{ t('La clave actual no coincide con la referencia del PDF. Revisa esta pregunta antes de usarla para estudiar.') }}</div>
    <p v-if="compact && question.explanation" class="muted solution-text" style="margin-bottom: 0;">{{ question.explanation }}</p>
    <div v-else-if="question.explanation" class="banner success solution-text">
      <strong>{{ t('Explicación:') }}</strong> {{ question.explanation }}
    </div>
    <div v-if="showNote && question.note" class="banner warning">
      <strong>{{ t('Nota:') }}</strong> {{ question.note }}
    </div>
  </div>
</template>
