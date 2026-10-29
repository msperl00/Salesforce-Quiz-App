import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const isVercel = Boolean(process.env.VERCEL || process.env.NITRO_PRESET === 'vercel')
const nativeDependencies = isVercel ? [] : Object.keys(JSON.parse(readFileSync(join(dirname(require.resolve('libsql')), 'package.json'), 'utf8')).optionalDependencies || {})
  .flatMap(name => { try { return [require.resolve(name)] } catch { return [] } })

export default defineNuxtConfig({
  compatibilityDate: '2025-01-15',
  devtools: { enabled: false },
  nitro: {
    externals: {
      traceInclude: nativeDependencies
    }
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Salesforce Quiz',
      meta: [{ name: 'theme-color', content: '#1e6f5c' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  routeRules: {
    '/favicon.ico': { redirect: '/favicon.svg' }
  },
  experimental: {
    appManifest: false
  },
  runtimeConfig: {
    tursoDatabaseUrl: process.env.TURSO_DATABASE_URL || '',
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
    authMode: 'local',
    sessionPassword: '',
    quizDatabasePath: process.env.QUIZ_DATABASE_PATH || './data/quiz.sqlite'
  }
})
