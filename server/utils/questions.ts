import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { AnswerInput, Question, QuestionPayload, QuizExport, Tag } from '~/types/quiz'

type QuestionRow = {
  id: number
  prompt: string
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

  return {
    prompt,
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

  database.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
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

  seedDatabase(database)
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
    prompt: row.prompt,
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

export function listQuestions(filters?: { search?: string, tag?: string }) {
  const database = getDb()

  const conditions: string[] = []
  const params: string[] = []

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
    SELECT questions.id, questions.prompt, questions.explanation, questions.note, questions.created_at, questions.updated_at
    FROM questions
    ${whereClause}
    ORDER BY questions.updated_at DESC
  `).all(...params) as QuestionRow[]

  return rows.map(row => hydrateQuestion(database, row))
}

export function listTags(): Tag[] {
  const database = getDb()

  const rows = database.prepare(`
    SELECT tags.id, tags.name
    FROM tags
    WHERE EXISTS (
      SELECT 1 FROM question_tags WHERE question_tags.tag_id = tags.id
    )
    ORDER BY tags.name COLLATE NOCASE ASC
  `).all() as TagRow[]

  return rows
}

export function getQuestionById(id: number) {
  const database = getDb()
  const row = database.prepare(`
    SELECT id, prompt, explanation, note, created_at, updated_at
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
  const timestamp = nowIso()

  const result = database.prepare(`
    INSERT INTO questions (prompt, explanation, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalized.prompt, normalized.explanation, normalized.note, timestamp, timestamp)

  const questionId = Number(result.lastInsertRowid)
  replaceAnswers(database, questionId, normalized.answers)
  syncTags(database, questionId, normalized.tags)

  return getQuestionById(questionId)
}

export function createQuestionRecord(payload: QuestionPayload) {
  return createQuestion(getDb(), payload)
}

export function updateQuestionRecord(id: number, payload: QuestionPayload) {
  const database = getDb()
  const normalized = normalizePayload(payload)

  const exists = database.prepare('SELECT id FROM questions WHERE id = ?').get(id) as { id: number } | undefined

  if (!exists) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pregunta no encontrada.'
    })
  }

  database.prepare(`
    UPDATE questions
    SET prompt = ?, explanation = ?, note = ?, updated_at = ?
    WHERE id = ?
  `).run(normalized.prompt, normalized.explanation, normalized.note, nowIso(), id)

  replaceAnswers(database, id, normalized.answers)
  syncTags(database, id, normalized.tags)

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

export function exportQuestions(): QuizExport {
  const questions = listQuestions().map(question => ({
    prompt: question.prompt,
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
    exportedAt: nowIso(),
    questions
  }
}

export function importQuestions(data: QuizExport | { questions?: QuestionPayload[] }, options?: { replaceExisting?: boolean }) {
  const database = getDb()
  const questions = Array.isArray(data?.questions) ? data.questions : []

  if (!questions.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'El JSON no contiene preguntas.'
    })
  }

  const transaction = database.transaction(() => {
    if (options?.replaceExisting) {
      database.prepare('DELETE FROM question_tags').run()
      database.prepare('DELETE FROM answers').run()
      database.prepare('DELETE FROM questions').run()
      database.prepare('DELETE FROM tags').run()
    }

    for (const question of questions) {
      createQuestion(database, question)
    }
  })

  transaction()

  return {
    imported: questions.length,
    total: listQuestions().length
  }
}
