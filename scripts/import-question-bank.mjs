import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openDatabase } from './database-client.mjs'
import { importNewQuestionBank, validateQuestionBank } from '../server/database/import-bank.mjs'

async function main() {
  const files = process.argv.slice(2).filter(arg => arg !== '--apply')
  if (!files.length) throw new Error('Uso: node --env-file=.env scripts/import-question-bank.mjs archivo.json [archivo2.json] [--apply]')
  const parts = await Promise.all(files.map(async path => JSON.parse(await readFile(path, 'utf8'))))
  if (parts.some(part => part.examName !== parts[0].examName || part.version !== 1 || !Array.isArray(part.questions))) {
    throw new Error('Todos los archivos deben pertenecer al mismo examen y usar version 1.')
  }
  const data = { ...parts[0], questions: parts.flatMap(part => part.questions) }
  const bank = validateQuestionBank(data)
  console.log(JSON.stringify({ examName: bank.examName, questions: bank.questions.length,
    images: bank.questions.filter(q => q.imageDataUrl).length, topics: [...new Set(bank.questions.flatMap(q => q.tags))] }, null, 2))
  if (!process.argv.includes('--apply')) {
    console.log('Validación completada. Usa --apply para crear el examen en la base configurada.')
    return
  }
  const db = await openDatabase()
  try {
    if ((await db.execute({ sql: 'SELECT id FROM exams WHERE name = ?', args: [bank.examName] })).rows.length) {
      throw new Error('El examen ya existe. No se ha modificado ni duplicado su contenido.')
    }
    const tables = ['exams', 'questions', 'answers', 'tags', 'question_tags']
    const snapshot = await db.batch(tables.map(table => `SELECT * FROM ${table}`), 'read')
    const backup = resolve('data', `bank-before-import-${new Date().toISOString().replaceAll(':', '-')}.json`)
    await mkdir(resolve('data'), { recursive: true })
    await writeFile(backup, JSON.stringify(tables.map((table, index) => ({ table, rows: snapshot[index].rows }))), { mode: 0o600, flag: 'wx' })
    console.log(`Copia del banco guardada en ${backup}`)
    const result = await importNewQuestionBank(db, data)
    console.log(JSON.stringify({ ...result, target: (process.env.NUXT_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL) ? 'Turso' : 'SQLite local' }))
  } finally { db.close() }
}

main().catch(error => {
  console.error(error.code ? `No se pudo importar (${error.code}).` : error.message)
  process.exitCode = 1
})
