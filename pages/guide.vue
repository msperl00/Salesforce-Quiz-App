<script setup lang="ts">
import type { StudyGuide } from '~/types/quiz'
import { initialCachedData } from '~/utils/async-cache.mjs'

const route = useRoute()
const router = useRouter()
const { t } = useLanguage()
const examId = Number(route.query.examId)
const { data, error, refresh } = await useFetch<{ guide: StudyGuide | null }>('/api/guides', {
  query: { examId }, key: `guide-index:${examId}`, getCachedData: initialCachedData
})
const guide = computed(() => data.value?.guide)
const selected = computed(() => typeof route.query.section === 'string'
  && (route.query.section === 'glosario' || guide.value?.sections.some(section => section.slug === route.query.section))
  ? route.query.section : guide.value?.sections[0]?.slug || 'inicio')
const isGlossary = computed(() => selected.value === 'glosario')
const current = computed(() => guide.value?.sections.find(section => section.slug === selected.value))
const position = computed(() => guide.value?.sections.findIndex(section => section.slug === selected.value) ?? -1)
const previous = computed(() => guide.value?.sections[position.value - 1])
const next = computed(() => guide.value?.sections[position.value + 1])
const heading = ref<HTMLHeadingElement | null>(null)
const article = ref<HTMLElement | null>(null)
const search = ref(typeof route.query.term === 'string' ? route.query.term : '')
const { data: content, pending, error: contentError, refresh: refreshContent } = await useFetch(
  () => `/api/guides/content?examId=${examId}&section=${selected.value}`, {
    immediate: Boolean(guide.value), watch: [selected]
  })
const terms = computed(() => {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const query = normalize(search.value.trim())
  return (content.value?.glossary || []).filter(entry => !query || normalize(
    [entry.term, entry.definition, ...entry.aliases].join(' ')).includes(query))
    .sort((a, b) => a.term.localeCompare(b.term, 'es'))
})
function target(section: string) { return { path: '/guide', query: { examId, section } } }
function selectSection(event: Event) { router.push(target((event.target as HTMLSelectElement).value)) }
function toggleDetails(open: boolean) {
  article.value?.querySelectorAll('details').forEach(details => { details.open = open })
}
function followGuideLink(event: MouseEvent) {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  const href = link?.getAttribute('href') || ''
  const match = href.match(/^\/guide\?examId=\d+&section=([a-z0-9-]+)$/)
  const slug = match?.[1] || ''
  if (slug === 'glosario' || guide.value?.sections.some(section => section.slug === slug)) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    router.push(target(slug))
  }
}
watch(selected, () => { search.value = '' })
watch(() => route.query.term, value => { search.value = typeof value === 'string' ? value : '' })
watch(pending, async (loading, wasLoading) => {
  if (!loading && wasLoading) {
    await nextTick()
    heading.value?.focus({ preventScroll: true })
    heading.value?.scrollIntoView({ block: 'start' })
  }
})
</script>

<template>
  <div class="stack guide-page">
    <ExamHeading :exam-id="examId" />
    <div v-if="error" class="banner warning" role="alert">
      {{ t('No se pudo cargar la guía.') }}
      <button class="btn ghost small" type="button" @click="refresh()">{{ t('Reintentar') }}</button>
    </div>
    <section v-else-if="!guide" class="panel stack">
      <h2>{{ t('Esta certificación aún no tiene guía.') }}</h2>
      <NuxtLink class="btn ghost" :to="{ path: '/study', query: { examId } }">{{ t('Estudiar') }}</NuxtLink>
    </section>
    <template v-else>
      <section class="panel guide-intro">
        <div>
          <p class="eyebrow">{{ t('Material de estudio') }}</p>
          <h2>{{ guide.title }}</h2>
          <p class="muted">{{ t('{chapters} temas y {terms} términos para consultar a tu ritmo.', { chapters: guide.sections.filter(s => s.kind === 'topic').length, terms: guide.termCount }) }}</p>
          <p class="muted guide-language">{{ t('Contenido de la guía en español; términos técnicos en inglés.') }}</p>
        </div>
        <nav class="guide-tabs" :aria-label="t('Secciones de la guía')">
          <NuxtLink :to="target(isGlossary ? 'inicio' : selected)" :aria-current="!isGlossary ? 'page' : undefined" :class="{ active: !isGlossary }">{{ t('Teoría') }}</NuxtLink>
          <NuxtLink :to="target('glosario')" :aria-current="isGlossary ? 'page' : undefined" :class="{ active: isGlossary }">{{ t('Glosario') }} <span>{{ guide.termCount }}</span></NuxtLink>
        </nav>
      </section>
      <div class="guide-layout">
        <aside class="panel guide-index">
          <h3>{{ t('Contenido') }}</h3>
          <nav :aria-label="t('Índice de la guía')">
            <NuxtLink v-for="section in guide.sections" :key="section.slug" :to="target(section.slug)" :aria-current="selected === section.slug ? 'page' : undefined" :class="{ active: selected === section.slug }">
              {{ section.title }}
            </NuxtLink>
            <NuxtLink :to="target('glosario')" :aria-current="isGlossary ? 'page' : undefined" :class="{ active: isGlossary }">{{ t('Glosario') }}</NuxtLink>
          </nav>
        </aside>
        <section class="panel guide-reader" :aria-busy="pending">
          <div class="field guide-mobile-index">
            <label for="guide-chapter">{{ t('Ir a un capítulo') }}</label>
            <select id="guide-chapter" :value="selected" @change="selectSection">
              <option v-for="section in guide.sections" :key="section.slug" :value="section.slug">{{ section.title }}</option>
              <option value="glosario">{{ t('Glosario') }}</option>
            </select>
          </div>
          <header class="stack guide-chapter-heading">
            <p class="eyebrow">{{ t(isGlossary ? 'Glosario' : current?.kind === 'topic' ? 'Teoría' : 'Consulta rápida') }}</p>
            <h2 ref="heading" tabindex="-1">{{ isGlossary ? t('Glosario') : current?.title }}</h2>
            <p v-if="!isGlossary && current?.subtitle" class="muted">{{ current.subtitle }}</p>
          </header>
          <p v-if="pending" class="banner" role="status">{{ t('Cargando contenido...') }}</p>
          <div v-else-if="contentError" class="banner warning" role="alert">
            {{ t('No se pudo cargar el capítulo.') }}
            <button class="btn ghost small" type="button" @click="refreshContent()">{{ t('Reintentar') }}</button>
          </div>
          <template v-else-if="isGlossary">
            <div class="field guide-search">
              <label for="glossary-search">{{ t('Buscar en el glosario') }}</label>
              <input id="glossary-search" v-model="search" type="search" :placeholder="t('Término, sigla o definición')" autocomplete="off" aria-describedby="glossary-count">
              <p id="glossary-count" class="muted" role="status">{{ t('{count} términos encontrados', { count: terms.length }) }}</p>
            </div>
            <dl class="guide-glossary">
              <div v-for="entry in terms" :key="entry.term">
                <dt>{{ entry.term }}</dt>
                <dd>{{ entry.definition }}</dd>
              </div>
            </dl>
            <p v-if="!terms.length" class="empty-state">{{ t('No hay términos para esta búsqueda.') }}</p>
          </template>
          <template v-else>
            <div class="inline-actions guide-reader-tools">
              <button class="btn ghost small" type="button" @click="toggleDetails(true)">{{ t('Desplegar todo') }}</button>
              <button class="btn ghost small" type="button" @click="toggleDetails(false)">{{ t('Plegar todo') }}</button>
              <NuxtLink class="btn ghost small" :to="target('glosario')">{{ t('Consultar glosario') }}</NuxtLink>
            </div>
            <article ref="article" class="guide-content" @click="followGuideLink" v-html="content?.html || ''" />
            <div v-if="current?.tag" class="guide-practice">
              <h3>{{ t('Ponlo en práctica') }}</h3>
              <p class="muted">{{ t('Repasa las preguntas de este tema con sus explicaciones.') }}</p>
              <NuxtLink class="btn primary" :to="{ path: '/study', query: { examId, tag: current.tag } }">{{ t('Practicar este tema') }}</NuxtLink>
              <NuxtLink class="btn ghost" :to="{ path: '/exam', query: { examId, tag: current.tag } }">{{ t('Simulacro del tema') }}</NuxtLink>
            </div>
            <nav class="guide-pagination" :aria-label="t('Navegación de capítulos')">
              <NuxtLink v-if="previous" :to="target(previous.slug)"><span>{{ t('Anterior') }}</span>{{ previous.title }}</NuxtLink>
              <NuxtLink v-if="next" :to="target(next.slug)"><span>{{ t('Siguiente') }}</span>{{ next.title }}</NuxtLink>
              <NuxtLink v-else :to="target('glosario')"><span>{{ t('Siguiente') }}</span>{{ t('Glosario') }}</NuxtLink>
            </nav>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>
