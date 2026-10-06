import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { AnswerInput, Exam, Question, QuestionPayload, QuizExport, Tag } from '~/types/quiz'

type QuestionRow = {
  id: number
  exam_id: number
  prompt: string
  image_data_url: string | null
  explanation: string | null
  note: string | null
  created_at: string
  updated_at: string
}

type AnswerRow = {
  id: number
  question_id: number
  text: string
  is_correct: number
  position: number
}

type TagRow = {
  id: number
  name: string
}

let db: Database.Database | null = null

function nowIso() {
  return new Date().toISOString()
}

function normalizePayload(payload: QuestionPayload): QuestionPayload {
  const prompt = payload.prompt?.trim()
  const answers = (payload.answers || [])
    .map(answer => ({
      id: answer.id,
      text: answer.text?.trim(),
      isCorrect: Boolean(answer.isCorrect)
    }))
    .filter(answer => answer.text)

  const tags = [...new Set((payload.tags || []).map(tag => tag.trim()).filter(Boolean))]
  const imageDataUrl = payload.imageDataUrl?.trim() || ''

  if (!prompt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La pregunta no puede estar vacia.'
    })
  }

  if (answers.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cada pregunta necesita al menos dos respuestas.'
    })
  }

  if (!answers.some(answer => answer.isCorrect)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Marca al menos una respuesta correcta.'
    })
  }

  if (imageDataUrl && !/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(imageDataUrl)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La imagen debe ser PNG, JPG, WEBP o GIF.'
    })
  }

  if (imageDataUrl.length > 6_000_000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La imagen es demasiado grande. El máximo es 4 MB.'
    })
  }

  return {
    examId: payload.examId,
    prompt,
    imageDataUrl,
    explanation: payload.explanation?.trim() || '',
    note: payload.note?.trim() || '',
    answers,
    tags
  }
}

function getDatabasePath() {
  const config = useRuntimeConfig()

  return resolve(process.cwd(), config.quizDatabasePath)
}

function seedDatabase(database: Database.Database) {
  const countRow = database.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number }

  if (countRow.count > 0) {
    return
  }

  createQuestion(database, {
    prompt: 'Which Salesforce API is best suited for large data exports in batches?',
    explanation: 'Bulk API is designed for asynchronous processing of large volumes of records.',
    note: 'Piensa en operaciones masivas y asíncronas.',
    tags: ['Integration', 'APIs'],
    answers: [
      { text: 'REST API', isCorrect: false },
      { text: 'Bulk API', isCorrect: true },
      { text: 'Metadata API', isCorrect: false },
      { text: 'Streaming API', isCorrect: false }
    ]
  })

  createQuestion(database, {
    prompt: 'Which statement about validation rules is correct?',
    explanation: 'Validation rules prevent records from being saved when the formula evaluates to true.',
    note: 'La regla se dispara cuando la condición da verdadero.',
    tags: ['Automation', 'Platform'],
    answers: [
      { text: 'They run only after a record is deleted.', isCorrect: false },
      { text: 'They can block a save when a formula returns true.', isCorrect: true },
      { text: 'They can update related records automatically.', isCorrect: false },
      { text: 'They replace assignment rules.', isCorrect: false }
    ]
  })
}

function initDatabase(database: Database.Database) {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  const isNewDatabase = !database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'questions'").get()
  database.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      image_data_url TEXT DEFAULT '',
      explanation TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS question_tags (
      question_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (question_id, tag_id),
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `)

  const questionColumns = database.pragma('table_info(questions)') as Array<{ name: string }>
  if (!questionColumns.some(column => column.name === 'image_data_url')) {
    database.exec("ALTER TABLE questions ADD COLUMN image_data_url TEXT DEFAULT ''")
  }

  database.transaction(() => {
    if (!questionColumns.some(column => column.name === 'exam_id')) {
      database.prepare('INSERT INTO exams (name) VALUES (?)').run('General')
      const general = database.prepare('SELECT id FROM exams WHERE name = ?').get('General') as { id: number }
      database.exec('ALTER TABLE questions ADD COLUMN exam_id INTEGER REFERENCES exams(id)')
      database.prepare('UPDATE questions SET exam_id = ?').run(general.id)
    }
    database.exec('CREATE INDEX IF NOT EXISTS questions_exam_id ON questions(exam_id)')
  })()

  if (isNewDatabase) seedDatabase(database)
}

export function getDb() {
  if (!db) {
    const databasePath = getDatabasePath()
    mkdirSync(dirname(databasePath), { recursive: true })
    db = new Database(databasePath)
    initDatabase(db)
  }

  return db
}

function hydrateQuestion(database: Database.Database, row: QuestionRow): Question {
  const answers = database.prepare(`
    SELECT id, question_id, text, is_correct, position
    FROM answers
    WHERE question_id = ?
    ORDER BY position ASC, id ASC
  `).all(row.id) as AnswerRow[]

  const tags = database.prepare(`
    SELECT tags.id, tags.name
    FROM tags
    INNER JOIN question_tags ON question_tags.tag_id = tags.id
    WHERE question_tags.question_id = ?
    ORDER BY tags.name COLLATE NOCASE ASC
  `).all(row.id) as TagRow[]

  return {
    id: row.id,
    examId: row.exam_id,
    prompt: row.prompt,
    imageDataUrl: row.image_data_url || '',
    explanation: row.explanation || '',
    note: row.note || '',
    answers: answers.map(answer => ({
      id: answer.id,
      text: answer.text,
      isCorrect: Boolean(answer.is_correct)
    })),
    tags: tags.map(tag => ({ id: tag.id, name: tag.name })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function syncTags(database: Database.Database, questionId: number, tagNames: string[]) {
  database.prepare('DELETE FROM question_tags WHERE question_id = ?').run(questionId)

  const insertTag = database.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const selectTag = database.prepare('SELECT id, name FROM tags WHERE name = ?') as Database.Statement<[string], TagRow>
  const linkTag = database.prepare('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)')

  for (const tagName of tagNames) {
    insertTag.run(tagName)
    const tag = selectTag.get(tagName)

    if (tag) {
      linkTag.run(questionId, tag.id)
    }
  }
}

function replaceAnswers(database: Database.Database, questionId: number, answers: AnswerInput[]) {
  database.prepare('DELETE FROM answers WHERE question_id = ?').run(questionId)

  const insertAnswer = database.prepare(`
    INSERT INTO answers (question_id, text, is_correct, position)
    VALUES (?, ?, ?, ?)
  `)

  answers.forEach((answer, index) => {
    insertAnswer.run(questionId, answer.text, answer.isCorrect ? 1 : 0, index)
  })
}

export function listQuestions(filters?: { search?: string, tag?: string, examId?: number }) {
  const database = getDb()

  const conditions: string[] = []
  const params: Array<string | number> = []
  if (filters?.examId !== undefined) {
    getExam(filters.examId)
    conditions.push('questions.exam_id = ?')
    params.push(filters.examId)
  }

  if (filters?.search) {
    conditions.push('(questions.prompt LIKE ? OR questions.explanation LIKE ? OR questions.note LIKE ?)')
    const query = `%${filters.search.trim()}%`
    params.push(query, query, query)
  }

  if (filters?.tag) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM question_tags
        INNER JOIN tags ON tags.id = question_tags.tag_id
        WHERE question_tags.question_id = questions.id
          AND tags.name = ?
      )
    `)
    params.push(filters.tag.trim())
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = database.prepare(`
    SELECT questions.*
    FROM questions
    ${whereClause}
    ORDER BY questions.updated_at DESC
  `).all(...params) as QuestionRow[]

  return rows.map(row => hydrateQuestion(database, row))
}

export function listTags(examId: number): Tag[] {
  const database = getDb()
  getExam(examId)

  const rows = database.prepare(`
    SELECT tags.id, tags.name
    FROM tags
    WHERE EXISTS (
      SELECT 1 FROM question_tags
      INNER JOIN questions ON questions.id = question_tags.question_id
      WHERE question_tags.tag_id = tags.id AND questions.exam_id = ?
    )
    ORDER BY tags.name COLLATE NOCASE ASC
  `).all(examId) as TagRow[]

  return rows
}

export function getQuestionById(id: number) {
  const database = getDb()
  const row = database.prepare(`
    SELECT *
    FROM questions
    WHERE id = ?
  `).get(id) as QuestionRow | undefined

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pregunta no encontrada.'
    })
  }

  return hydrateQuestion(database, row)
}

function createQuestion(database: Database.Database, payload: QuestionPayload) {
  const normalized = normalizePayload(payload)
  const examId = normalized.examId ?? (database.prepare('SELECT id FROM exams ORDER BY id LIMIT 1').get() as { id: number }).id
  getExam(examId)
  const timestamp = nowIso()

  const result = database.prepare(`
    INSERT INTO questions (prompt, image_data_url, explanation, note, created_at, updated_at, exam_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(normalized.prompt, normalized.imageDataUrl || '', normalized.explanation, normalized.note, timestamp, timestamp, examId)

  const questionId = Number(result.lastInsertRowid)
  replaceAnswers(database, questionId, normalized.answers)
  syncTags(database, questionId, normalized.tags)

  return getQuestionById(questionId)
}

export function createQuestionRecord(payload: QuestionPayload) {
  getExam(payload.examId as number)
  const database = getDb()
  return database.transaction(() => createQuestion(database, payload))()
}

export function updateQuestionRecord(id: number, payload: QuestionPayload) {
  const database = getDb()
  const normalized = normalizePayload(payload)

  const exists = database.prepare('SELECT id, exam_id FROM questions WHERE id = ?').get(id) as { id: number, exam_id: number } | undefined

  if (!exists) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pregunta no encontrada.'
    })
  }

  const examId = normalized.examId ?? exists.exam_id
  getExam(examId)
  database.transaction(() => {
    database.prepare(`
    UPDATE questions
    SET prompt = ?, image_data_url = ?, explanation = ?, note = ?, updated_at = ?, exam_id = ?
    WHERE id = ?
    `).run(normalized.prompt, normalized.imageDataUrl || '', normalized.explanation, normalized.note, nowIso(), examId, id)

    replaceAnswers(database, id, normalized.answers)
    syncTags(database, id, normalized.tags)
  })()

  return getQuestionById(id)
}

export function deleteQuestionRecord(id: number) {
  const database = getDb()
  const result = database.prepare('DELETE FROM questions WHERE id = ?').run(id)

  if (!result.changes) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pregunta no encontrada.'
    })
  }

  database.prepare(`
    DELETE FROM tags
    WHERE id IN (
      SELECT tags.id
      FROM tags
      LEFT JOIN question_tags ON question_tags.tag_id = tags.id
      GROUP BY tags.id
      HAVING COUNT(question_tags.question_id) = 0
    )
  `).run()

  return { success: true }
}

export function exportQuestions(examId: number): QuizExport {
  const exam = getExam(examId)
  const questions = listQuestions({ examId }).map(question => ({
    prompt: question.prompt,
    imageDataUrl: question.imageDataUrl,
    explanation: question.explanation,
    note: question.note,
    tags: question.tags.map(tag => tag.name),
    answers: question.answers.map(answer => ({
      text: answer.text,
      isCorrect: answer.isCorrect
    }))
  }))

  return {
    version: 1,
    examName: exam.name,
    exportedAt: nowIso(),
    questions
  }
}

export function importQuestions(data: QuizExport | { questions?: QuestionPayload[] }, options: { replaceExisting?: boolean, examId: number }) {
  const database = getDb()
  getExam(options.examId)
  const questions = Array.isArray(data?.questions) ? data.questions : []

  if (!questions.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'El JSON no contiene preguntas.'
    })
  }

  const transaction = database.transaction(() => {
    if (options?.replaceExisting) {
      database.prepare('DELETE FROM questions WHERE exam_id = ?').run(options.examId)
    }

    for (const question of questions) {
      createQuestion(database, { ...question, examId: options.examId })
    }
  })

  transaction()

  return {
    imported: questions.length,
    total: listQuestions({ examId: options.examId }).length
  }
}

export function getExam(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona un examen valido.' })
  }
  const exam = getDb().prepare('SELECT id, name FROM exams WHERE id = ?').get(id) as { id: number, name: string } | undefined
  if (!exam) throw createError({ statusCode: 404, statusMessage: 'Examen no encontrado.' })
  return exam
}

export function listExams(): Exam[] {
  return getDb().prepare(`
    SELECT exams.id, exams.name, COUNT(questions.id) AS questionCount
    FROM exams LEFT JOIN questions ON questions.exam_id = exams.id
    GROUP BY exams.id ORDER BY exams.name COLLATE NOCASE
  `).all() as Exam[]
}

export function saveExam(name: unknown, id?: number) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'El nombre debe tener entre 1 y 120 caracteres.' })
  }
  const database = getDb()
  if (id !== undefined) getExam(id)
  const duplicate = database.prepare('SELECT id FROM exams WHERE name = ?').get(name.trim()) as { id: number } | undefined
  if (duplicate && duplicate.id !== id) {
    throw createError({ statusCode: 409, statusMessage: 'Ya existe un examen con ese nombre.' })
  }
  if (id !== undefined) {
    database.prepare('UPDATE exams SET name = ? WHERE id = ?').run(name.trim(), id)
  } else {
    id = Number(database.prepare('INSERT INTO exams (name) VALUES (?)').run(name.trim()).lastInsertRowid)
  }
  return getExam(id)
}
