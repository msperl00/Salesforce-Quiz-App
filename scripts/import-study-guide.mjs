import { readFile } from 'node:fs/promises'
import { openDatabase } from './database-client.mjs'
import { importStudyGuide, validateStudyGuide } from '../server/database/study-guide.mjs'

async function main() {
  const [file, rawExamId, ...flags] = process.argv.slice(2)
  const examId = Number(rawExamId)
  if (!file || !Number.isSafeInteger(examId) || examId <= 0 || flags.some(flag => flag !== '--apply')) {
    throw new Error('Uso: node --env-file=.env scripts/import-study-guide.mjs guía.json examId [--apply]')
  }
  const data = validateStudyGuide(JSON.parse(await readFile(file, 'utf8')))
  console.log(JSON.stringify({ examId, title: data.title, sections: data.sections.length, terms: data.glossary.length }))
  if (!flags.includes('--apply')) return console.log('Validado. Añade --apply para guardar la guía.')
  const db = await openDatabase()
  try {
    const exam = (await db.execute({ sql: 'SELECT name FROM exams WHERE id = ?', args: [examId] })).rows[0]
    if (!exam) throw new Error('El examen no existe.')
    if ((await db.execute({ sql: 'SELECT exam_id FROM study_guides WHERE exam_id = ?', args: [examId] })).rows.length) {
      throw new Error('Este examen ya tiene guía. No se ha sobrescrito.')
    }
    console.log(JSON.stringify({ examName: exam.name, ...await importStudyGuide(db, examId, data) }))
  } finally { db.close() }
}
main().catch(error => { console.error(error.code ? `No se pudo importar (${error.code}).` : error.message); process.exitCode = 1 })
