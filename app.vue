<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Salesforce Quiz App</p>
        <h1>Estudio simple, local y fácil de mantener</h1>
      </div>

      <nav class="nav">
        <NuxtLink to="/">Preguntas</NuxtLink>
        <NuxtLink to="/study">Estudiar</NuxtLink>
        <NuxtLink to="/exam">Modo examen</NuxtLink>
      </nav>
    </header>

    <main class="page-wrap">
      <NuxtPage />
    </main>
  </div>
</template>
