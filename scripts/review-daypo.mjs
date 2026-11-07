import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './database-client.mjs'

export function questionFingerprint(question) {
  const value = { prompt: question.prompt, explanation: question.explanation, note: question.note,
    answers: question.answers.map(answer => ({ text: answer.text, isCorrect: Boolean(answer.isCorrect) })) }
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function planDaypoReview(questions, review) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.date || '') || !Array.isArray(review.updates)) throw new Error('Revisión inválida.')
  const seen = new Set()
  return review.updates.map(update => {
    if (!/^P\d{3}$/.test(update.ref) || seen.has(update.ref)
      || !['corrected', 'clarified', 'pending'].includes(update.status)
      || !update.explanation?.trim() || !Array.isArray(update.sources) || !update.sources.length
      || update.sources.some(url => !/^https:\/\/(?:developer\.salesforce\.com|architect\.salesforce\.com|help\.salesforce\.com|trailhead\.salesforce\.com|docs\.mulesoft\.com)\//.test(url))) {
      throw new Error('Incidencia inválida.')
    }
    seen.add(update.ref)
    const matches = questions.filter(question => question.note === `Origen: Daypo · ${update.ref}`)
    if (matches.length !== 1 || questionFingerprint(matches[0]) !== update.expectedHash) {
      throw new Error(`${update.ref}: el material cambió o ya se revisó; no se sobrescribe.`)
    }
    const original = matches[0]
    if (update.correctIndex !== undefined && (update.status !== 'corrected'
      || !Number.isSafeInteger(update.correctIndex) || update.correctIndex < 0 || update.correctIndex >= original.answers.length)) {
      throw new Error(`${update.ref}: clave inválida.`)
    }
    const oldKey = original.answers.flatMap((answer, index) => answer.isCorrect ? [String.fromCharCode(65 + index)] : []).join(', ')
    const label = update.status === 'pending' ? 'PENDIENTE' : update.status === 'corrected' ? 'CORREGIDA' : 'ACLARADA'
    return { original, updated: { ...original,
      note: `${original.note}\nRevisión Daypo (${review.date}): ${label}. Clave original: ${oldKey}.`,
      explanation: `${update.explanation}\n\nFuentes oficiales:\n${update.sources.join('\n')}`,
      answers: original.answers.map((answer, index) => ({ ...answer,
        isCorrect: update.correctIndex === undefined ? answer.isCorrect : index === update.correctIndex })) } }
  })
}

export async function saveDaypoReview(db, examId, plan) {
  const statements = ['CREATE TABLE daypo_review_guard (ok INTEGER NOT NULL CHECK (ok = 1))']
  // Guard original questions and answer keys inside the same atomic batch.
  for (const { original } of plan) {
    const answerChecks = original.answers.map(() => '(id = ? AND text = ? AND is_correct = ? AND position = ?)').join(' OR ')
    statements.push({ sql: `INSERT INTO daypo_review_guard SELECT CASE WHEN
      EXISTS(SELECT 1 FROM questions WHERE id = ? AND exam_id = ? AND prompt = ? AND explanation = ? AND note = ?)
      AND (SELECT count(*) FROM answers WHERE question_id = ?) = ?
      AND (SELECT count(*) FROM answers WHERE question_id = ? AND (${answerChecks})) = ? THEN 1 ELSE 0 END`,
    args: [original.id, examId, original.prompt, original.explanation, original.note,
      original.id, original.answers.length, original.id,
      ...original.answers.flatMap((answer, index) => [answer.id, answer.text, answer.isCorrect ? 1 : 0, answer.position ?? index]), original.answers.length] })
  }
  const now = new Date().toISOString()
  for (const { original, updated } of plan) {
    statements.push({ sql: 'UPDATE questions SET explanation = ?, note = ?, updated_at = ? WHERE id = ? AND exam_id = ?',
      args: [updated.explanation, updated.note, now, original.id, examId] })
    for (const answer of updated.answers) statements.push({ sql: 'UPDATE answers SET is_correct = ? WHERE id = ? AND question_id = ?',
      args: [answer.isCorrect ? 1 : 0, answer.id, original.id] })
  }
  statements.push('DROP TABLE daypo_review_guard')
  await db.batch(statements, 'write')
}

async function main() {
  const [file, rawExamId, ...flags] = process.argv.slice(2)
  const examId = Number(rawExamId)
  if (!file || !Number.isSafeInteger(examId) || examId <= 0 || flags.some(flag => flag !== '--apply')) {
    throw new Error('Uso: node --env-file=.env scripts/review-daypo.mjs revisión.json examId [--apply]')
  }
  const review = JSON.parse(await readFile(file, 'utf8'))
  const db = await openDatabase()
  try {
    const [exams, rows, answers] = await db.batch([
      { sql: 'SELECT name FROM exams WHERE id = ?', args: [examId] },
      { sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY id', args: [examId] },
      { sql: 'SELECT answers.* FROM answers JOIN questions ON questions.id = answers.question_id WHERE questions.exam_id = ? ORDER BY question_id, position', args: [examId] }
    ], 'read')
    if (exams.rows[0]?.name !== review.examName || rows.rows.length !== review.screenedQuestions) throw new Error('El examen no coincide con el banco revisado.')
    const questions = rows.rows.map(row => ({ ...row, answers: answers.rows.filter(answer => answer.question_id === row.id)
      .map(answer => ({ ...answer, isCorrect: Boolean(answer.is_correct) })) }))
    const plan = planDaypoReview(questions, review)
    console.log(JSON.stringify({ screened: questions.length, updates: plan.length,
      pending: review.updates.filter(item => item.status === 'pending').map(item => item.ref),
      answerKeyChanges: review.updates.filter(item => item.correctIndex !== undefined).map(item => item.ref) }))
    if (!flags.includes('--apply')) return console.log('Validado. Añade --apply para actualizar el banco.')
    await mkdir('data', { recursive: true })
    const backup = resolve('data', `daypo-before-review-${examId}-${Date.now()}.json`)
    await writeFile(backup, JSON.stringify({ examId, questions: rows.rows, answers: answers.rows }), { mode: 0o600, flag: 'wx' })
    await saveDaypoReview(db, examId, plan)
    console.log(`Revisión guardada. Copia original: ${backup}`)
  } finally { db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.code ? `No se pudo revisar (${error.code}).` : error.message); process.exitCode = 1 })
}
