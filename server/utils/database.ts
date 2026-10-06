import { createClient as createRemoteClient } from '@libsql/client/web'
import type { Client, Transaction, InValue } from '@libsql/client'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrateDatabase } from '../database/schema.mjs'

export type Database = Client | Transaction
let connection: Promise<Client> | undefined

export async function query(db: Database, sql: string, args: InValue[] = []) {
  return (await db.execute({ sql, args })).rows
}

export async function getDb(): Promise<Client> {
  if (!connection) {
    connection = (async () => {
      const config = useRuntimeConfig()
      let url = config.tursoDatabaseUrl
      let createClient = createRemoteClient
      if (process.env.VERCEL && (!url || !config.tursoAuthToken)) {
        throw createError({ statusCode: 503, statusMessage: 'Falta configurar Turso.' })
      }
      if (!url) {
        createClient = (await import('@libsql/client')).createClient
        const path = resolve(config.quizDatabasePath)
        await mkdir(dirname(path), { recursive: true })
        url = pathToFileURL(path).href
      }
      const db = createClient({ url, authToken: config.tursoAuthToken || undefined })
      try {
        await db.execute('PRAGMA foreign_keys = ON')
        await migrateDatabase(db)
        return db
      } catch (error) { db.close(); throw error }
    })().catch((error) => { connection = undefined; throw error })
  }
  return connection
}

export async function transaction<T>(fn: (db: Transaction) => Promise<T>) {
  const tx = await (await getDb()).transaction('write')
  try {
    const result = await fn(tx)
    await tx.commit()
    return result
  } finally { tx.close() }
}
