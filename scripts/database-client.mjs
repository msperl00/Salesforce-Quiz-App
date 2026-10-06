import { createClient } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrateDatabase } from '../server/database/schema.mjs'

export async function openDatabase({ remoteOnly = false } = {}) {
  let url = process.env.NUXT_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
  const authToken = process.env.NUXT_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
  if (remoteOnly && (!url || !authToken || !/^libsql:\/\//.test(url))) {
    throw new Error('Configura la URL libsql y el token de Turso en .env.')
  }
  if (!url) {
    const path = resolve(process.env.NUXT_QUIZ_DATABASE_PATH || process.env.QUIZ_DATABASE_PATH || './data/quiz.sqlite')
    await mkdir(dirname(path), { recursive: true })
    url = pathToFileURL(path).href
  }
  const client = createClient({ url, authToken })
  try {
    await client.execute('PRAGMA foreign_keys = ON')
    await migrateDatabase(client)
    return client
  } catch (error) { client.close(); throw error }
}
