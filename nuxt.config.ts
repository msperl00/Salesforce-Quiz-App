export default defineNuxtConfig({
  compatibilityDate: '2025-01-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  experimental: {
    appManifest: false
  },
  runtimeConfig: {
    quizDatabasePath: process.env.QUIZ_DATABASE_PATH || './data/quiz.sqlite'
  }
})
