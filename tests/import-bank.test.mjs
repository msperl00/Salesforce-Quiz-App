import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { migrateDatabase } from '../server/database/schema.mjs'
import { hydrateQuestions } from '../server/database/question-reader.mjs'
import { importNewQuestionBank } from '../server/database/import-bank.mjs'

const image = 'data:image/png;base64,iVBORw0KGgo='
const bank = { version: 1, examName: 'Integration Architect', questions: [
  { prompt: 'Same scenario', imageDataUrl: image, explanation: 'Reason', note: 'P001', tags: ['Events'],
    answers: [{ text: 'First', isCorrect: true }, { text: 'Second', isCorrect: false }] },
  { prompt: 'Same scenario', explanation: 'Variant', note: 'P002', tags: ['Security', 'Events'],
    answers: [{ text: 'Third', isCorrect: true }, { text: 'Fourth', isCorrect: true }] }
] }

async function withDatabase(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-import-'))
  const db = createClient({ url: pathToFileURL(join(directory, 'bank.sqlite')).href })
  try { await migrateDatabase(db); await fn(db) } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
}

test('new bank preserves variants, answer keys, images, topics and existing exams; repeat import cannot duplicate it', async () => {
  await withDatabase(async db => {
    const previous = await importNewQuestionBank(db, { ...bank, examName: 'Previous' })
    const before = (await db.execute({ sql: 'SELECT * FROM questions WHERE exam_id = ?', args: [previous.examId] })).rows
    const result = await importNewQuestionBank(db, bank)
    assert.equal(result.imported, 2)
    const rows = (await db.execute({ sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY id', args: [result.examId] })).rows
    const questions = await hydrateQuestions(db, rows, true)
    assert.equal(questions.length, 2)
    assert.equal(questions[0].imageDataUrl, image)
    assert.equal(questions[0].note, 'P001')
    assert.equal(questions[1].explanation, 'Variant')
    assert.deepEqual(questions.map(q => q.answers.map(a => [a.text, a.isCorrect])),
      bank.questions.map(q => q.answers.map(a => [a.text, a.isCorrect])))
    assert.deepEqual(questions.map(q => q.tags.map(t => t.name)), [['Events'], ['Events', 'Security']])
    await assert.rejects(importNewQuestionBank(db, { ...bank, examName: 'integration architect' }))
    assert.equal((await db.execute('SELECT count(*) AS n FROM questions')).rows[0].n, 4)
    assert.deepEqual((await db.execute({ sql: 'SELECT * FROM questions WHERE exam_id = ?', args: [previous.examId] })).rows, before)
  })
})

test('a database failure halfway through import rolls back the entire new exam', async () => {
  await withDatabase(async db => {
    await db.execute("CREATE TRIGGER reject_variant BEFORE INSERT ON questions WHEN NEW.note = 'P002' BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    await assert.rejects(importNewQuestionBank(db, bank))
    for (const table of ['exams', 'questions', 'answers', 'tags', 'question_tags']) {
      const rows = (await db.execute(`SELECT * FROM ${table}`)).rows
      assert.equal(rows.length, table === 'exams' ? 1 : 0)
      if (table === 'exams') assert.equal(rows[0].name, 'General')
    }
  })
})

test('invalid answer keys, tags and images cannot create an exam', async () => {
  await withDatabase(async db => {
    for (const question of [
      { ...bank.questions[0], answers: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] },
      { ...bank.questions[0], imageDataUrl: 'file:///private/image.png' },
      { ...bank.questions[0], tags: [''] }
    ]) await assert.rejects(importNewQuestionBank(db, { ...bank, questions: [question] }))
    assert.equal((await db.execute("SELECT count(*) AS n FROM exams WHERE name = 'Integration Architect'")).rows[0].n, 0)
  })
})
