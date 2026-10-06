import type { Exam, Question, QuestionPayload, QuizExport } from '~/types/quiz'
import { getDb, query, transaction, type Database } from './database'
import type { InStatement } from '@libsql/client'

function normalize(payload: QuestionPayload) {
  if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'La pregunta no puede estar vacia.' })
  }
  const answers = (Array.isArray(payload.answers) ? payload.answers : [])
    .filter(a => a && typeof a === 'object')
    .map(a => ({ text: typeof a.text === 'string' ? a.text.trim() : '', isCorrect: a.isCorrect === true })).filter(a => a.text)
  if (answers.length < 2 || !answers.some(a => a.isCorrect)) {
    throw createError({ statusCode: 400, statusMessage: 'Incluye dos respuestas y marca al menos una correcta.' })
  }
  const imageDataUrl = typeof payload.imageDataUrl === 'string' ? payload.imageDataUrl.trim() : ''
  if (imageDataUrl && (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl)
    || Buffer.from(imageDataUrl.split(',')[1], 'base64').length > 2 * 1024 * 1024)) {
    throw createError({ statusCode: 400, statusMessage: 'Usa PNG, JPG, WEBP o GIF de hasta 2 MB.' })
  }
  return {
    ...payload, prompt: payload.prompt.trim(), answers, imageDataUrl,
    explanation: typeof payload.explanation === 'string' ? payload.explanation.trim() : '',
    note: typeof payload.note === 'string' ? payload.note.trim() : '',
    tags: [...new Set((Array.isArray(payload.tags) ? payload.tags : []).filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean))]
  }
}

async function requireExam(db: Database, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Selecciona un examen valido.' })
  const exam = (await query(db, 'SELECT id, name FROM exams WHERE id = ?', [id]))[0]
  if (!exam) throw createError({ statusCode: 404, statusMessage: 'Examen no encontrado.' })
  return { id: Number(exam.id), name: String(exam.name) }
}
export async function getExam(id: number) { return requireExam(await getDb(), id) }
export async function listExams(): Promise<Exam[]> {
  return (await query(await getDb(), `SELECT exams.id, exams.name, COUNT(questions.id) AS count
    FROM exams LEFT JOIN questions ON questions.exam_id = exams.id GROUP BY exams.id ORDER BY exams.name COLLATE NOCASE`))
    .map(row => ({ id: Number(row.id), name: String(row.name), questionCount: Number(row.count) }))
}
export async function saveExam(name: unknown, id?: number) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'El nombre debe tener entre 1 y 120 caracteres.' })
  }
  const cleanName = name.trim()
  return transaction(async db => {
    if (id !== undefined) await requireExam(db, id)
    const duplicate = (await query(db, 'SELECT id FROM exams WHERE name = ?', [cleanName]))[0]
    if (duplicate && Number(duplicate.id) !== id) throw createError({ statusCode: 409, statusMessage: 'Ya existe un examen con ese nombre.' })
    if (id !== undefined) await query(db, 'UPDATE exams SET name = ? WHERE id = ?', [cleanName, id])
    else id = Number((await db.execute({ sql: 'INSERT INTO exams (name) VALUES (?)', args: [cleanName] })).lastInsertRowid)
    return { id, name: cleanName }
  })
}

async function hydrate(db: Database, row: any, includeImage = false): Promise<Question> {
  const answers = await query(db, 'SELECT id, text, is_correct FROM answers WHERE question_id = ? ORDER BY position, id', [row.id])
  const tags = await query(db, `SELECT tags.id, tags.name FROM tags JOIN question_tags ON question_tags.tag_id = tags.id
    WHERE question_tags.question_id = ? ORDER BY tags.name COLLATE NOCASE`, [row.id])
  return {
    id: Number(row.id), examId: Number(row.exam_id), prompt: String(row.prompt),
    imageDataUrl: includeImage ? String(row.image_data_url || '') : '',
    imageUrl: row.has_image || row.image_data_url ? `/api/questions/${row.id}/image?v=${encodeURIComponent(row.updated_at)}` : '',
    explanation: String(row.explanation || ''), note: String(row.note || ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    answers: answers.map(a => ({ id: Number(a.id), text: String(a.text), isCorrect: Boolean(a.is_correct) })),
    tags: tags.map(t => ({ id: Number(t.id), name: String(t.name) }))
  }
}
export async function listQuestions(filters: { search?: string, tag?: string, examId: number }) {
  const db = await getDb()
  await requireExam(db, filters.examId)
  const conditions = ['exam_id = ?']
  const args: (string | number)[] = [filters.examId]
  if (filters.search) {
    conditions.push('(prompt LIKE ? OR explanation LIKE ? OR note LIKE ?)')
    args.push(...Array(3).fill(`%${filters.search.trim()}%`))
  }
  if (filters.tag) {
    conditions.push(`EXISTS (SELECT 1 FROM question_tags JOIN tags ON tags.id = question_tags.tag_id
      WHERE question_tags.question_id = questions.id AND tags.name = ?)`)
    args.push(filters.tag.trim())
  }
  const rows = await query(db, `SELECT id, exam_id, prompt, explanation, note, created_at, updated_at,
    length(image_data_url) > 0 AS has_image FROM questions WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`, args)
  return Promise.all(rows.map(row => hydrate(db, row)))
}
export async function listTags(examId: number) {
  const db = await getDb()
  await requireExam(db, examId)
  return (await query(db, `SELECT DISTINCT tags.id, tags.name FROM tags
    JOIN question_tags ON question_tags.tag_id = tags.id JOIN questions ON questions.id = question_tags.question_id
    WHERE questions.exam_id = ? ORDER BY tags.name COLLATE NOCASE`, [examId]))
    .map(row => ({ id: Number(row.id), name: String(row.name) }))
}
export async function getQuestionById(id: number) {
  const db = await getDb()
  const row = (await query(db, 'SELECT * FROM questions WHERE id = ?', [id]))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Pregunta no encontrada.' })
  return hydrate(db, row, true)
}
async function writeQuestion(db: Database, payload: QuestionPayload, id?: number) {
  const value = normalize(payload)
  let examId = value.examId
  if (id !== undefined) {
    const old = (await query(db, 'SELECT exam_id FROM questions WHERE id = ?', [id]))[0]
    if (!old) throw createError({ statusCode: 404, statusMessage: 'Pregunta no encontrada.' })
    examId ??= Number(old.exam_id)
  }
  await requireExam(db, examId as number)
  const now = new Date().toISOString()
  const args = [value.prompt, value.imageDataUrl, value.explanation, value.note, now, examId!]
  if (id !== undefined) {
    await query(db, 'UPDATE questions SET prompt = ?, image_data_url = ?, explanation = ?, note = ?, updated_at = ?, exam_id = ? WHERE id = ?', [...args, id])
    await query(db, 'DELETE FROM answers WHERE question_id = ?', [id])
    await query(db, 'DELETE FROM question_tags WHERE question_id = ?', [id])
  } else {
    id = Number((await db.execute({ sql: `INSERT INTO questions (prompt, image_data_url, explanation, note, updated_at, exam_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [...args, now] })).lastInsertRowid)
  }
  for (const [position, answer] of value.answers.entries()) {
    await query(db, 'INSERT INTO answers (question_id, text, is_correct, position) VALUES (?, ?, ?, ?)', [id, answer.text, answer.isCorrect ? 1 : 0, position])
  }
  for (const name of value.tags) {
    await query(db, 'INSERT OR IGNORE INTO tags (name) VALUES (?)', [name])
    await query(db, 'INSERT INTO question_tags (question_id, tag_id) SELECT ?, id FROM tags WHERE name = ?', [id, name])
  }
  return id
}
export async function createQuestionRecord(payload: QuestionPayload) {
  return getQuestionById(await transaction(db => writeQuestion(db, payload)))
}
export async function updateQuestionRecord(id: number, payload: QuestionPayload) {
  return getQuestionById(await transaction(db => writeQuestion(db, payload, id)))
}
export async function deleteQuestionRecord(id: number) {
  return transaction(async db => {
    await query(db, 'DELETE FROM question_tags WHERE question_id = ?', [id])
    await query(db, 'DELETE FROM answers WHERE question_id = ?', [id])
    const result = await db.execute({ sql: 'DELETE FROM questions WHERE id = ?', args: [id] })
    if (!result.rowsAffected) throw createError({ statusCode: 404, statusMessage: 'Pregunta no encontrada.' })
    return { success: true }
  })
}
export async function exportQuestions(examId: number): Promise<QuizExport> {
  const exam = await getExam(examId)
  const db = await getDb()
  const rows = await query(db, 'SELECT * FROM questions WHERE exam_id = ?', [examId])
  const questions = await Promise.all(rows.map(row => hydrate(db, row, true)))
  return { version: 1, examName: exam.name, exportedAt: new Date().toISOString(), questions: questions.map(q => ({
    prompt: q.prompt, imageDataUrl: q.imageDataUrl, explanation: q.explanation, note: q.note,
    tags: q.tags.map(t => t.name), answers: q.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect }))
  })) }
}
export async function importQuestions(data: QuizExport, options: { examId: number, replaceExisting?: boolean }) {
  if (!Array.isArray(data?.questions) || !data.questions.length || data.questions.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Importa entre 1 y 100 preguntas por archivo.' })
  }
  const db = await getDb()
  await requireExam(db, options.examId)
  const values = data.questions.map(normalize)
  const statements: InStatement[] = []
  if (options.replaceExisting) {
    for (const table of ['question_tags', 'answers']) statements.push({
      sql: `DELETE FROM ${table} WHERE question_id IN (SELECT id FROM questions WHERE exam_id = ?)`, args: [options.examId]
    })
    statements.push({ sql: 'DELETE FROM questions WHERE exam_id = ?', args: [options.examId] })
  }
  // One atomic batch avoids the remote interactive transaction timeout during imports.
  for (const value of values) {
    const now = new Date().toISOString()
    statements.push({ sql: `INSERT INTO questions (prompt, image_data_url, explanation, note, updated_at, exam_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [value.prompt, value.imageDataUrl, value.explanation, value.note, now, options.examId, now] })
    for (const [position, answer] of value.answers.entries()) statements.push({
      sql: 'INSERT INTO answers (question_id, text, is_correct, position) SELECT max(id), ?, ?, ? FROM questions',
      args: [answer.text, answer.isCorrect ? 1 : 0, position]
    })
    for (const name of value.tags) {
      statements.push({ sql: 'INSERT OR IGNORE INTO tags (name) VALUES (?)', args: [name] })
      statements.push({ sql: 'INSERT INTO question_tags (question_id, tag_id) SELECT (SELECT max(id) FROM questions), id FROM tags WHERE name = ?', args: [name] })
    }
  }
  await db.batch(statements, 'write')
  const total = (await query(db, 'SELECT count(*) AS count FROM questions WHERE exam_id = ?', [options.examId]))[0]
  return { imported: values.length, total: Number(total.count) }
}
