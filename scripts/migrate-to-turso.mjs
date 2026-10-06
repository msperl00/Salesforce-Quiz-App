import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { openDatabase } from './database-client.mjs'
import { copyQuestionBank } from '../server/database/migrate-bank.mjs'

async function main() {
  const path = resolve(process.env.QUIZ_SOURCE_DATABASE_PATH || './data/quiz.sqlite')
  const source = new Database(path, { readonly: true, fileMustExist: true })
  const tables = ['exams', 'questions', 'answers', 'tags', 'question_tags']
  let records
  try {
    records = source.transaction(() => tables.map(table => ({ table, rows: source.prepare(`SELECT * FROM ${table}`).all() })))()
  } finally { source.close() }
  const db = await openDatabase({ remoteOnly: true })
  try {
    await copyQuestionBank(db, records)
    console.log(`Migracion completada: ${records.find(item => item.table === 'questions').rows.length} preguntas. Las cuentas no se copian.`)
  } finally { db.close() }
}
main().catch(() => { console.error('No se pudo migrar. Comprueba la conexion, el esquema local y que Turso no tenga preguntas ni examenes propios. No se sobrescriben datos.'); process.exitCode = 1 })
