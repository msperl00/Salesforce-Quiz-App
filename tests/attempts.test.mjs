import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrateDatabase } from '../server/database/schema.mjs'
import { listAttempts, saveAttempt } from '../server/database/attempts.mjs'
import { replayQuestions } from '../utils/replay.mjs'

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const payload = { id: uuid(1), examId: 2, mode: 'exam', questionIds: [3, 1, 2] }

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-attempts-'))
  const db = createClient({ url: pathToFileURL(join(directory, 'quiz.sqlite')).href })
  try {
    await db.execute('PRAGMA foreign_keys = ON')
    await migrateDatabase(db)
    await db.batch([
      "INSERT INTO exams (id, name) VALUES (2, 'Examen A'), (3, 'Examen B')",
      ...[1, 2, 3, 4].map(id => ({ sql: 'INSERT INTO questions (id, exam_id, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        args: [id, id === 4 ? 3 : 2, `Pregunta ${id}`, 'antes', 'antes'] }))
    ], 'write')
    await run(db)
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
}

test('replaying uses the exact saved order, never shuffles or mutates the bank', () => {
  const bank = [1, 2, 3].map(id => ({ id, examId: 2, prompt: `Pregunta ${id}` }))
  const before = JSON.stringify(bank)
  const result = replayQuestions(bank, [3, 1, 2], 2)
  assert.deepEqual(result.map(q => q.id), [3, 1, 2])
  assert.notEqual(result, bank)
  assert.equal(JSON.stringify(bank), before)
  assert.equal(result[0], bank[2])
})

test('missing, moved, invalid or duplicate questions cannot start a partial replay', () => {
  const bank = [{ id: 1, examId: 2 }, { id: 2, examId: 3 }]
  for (const ids of [[], [1, 1], [1, 2], [1, 99], [0], [-1], ['1'], null]) {
    assert.equal(replayQuestions(bank, ids, 2), null)
  }
  assert.deepEqual(replayQuestions(bank, [1], 2), [bank[0]])
})

test('history persists mode and ordered IDs privately per account and exam, including local owner 0', () => fixture(async db => {
  const first = await saveAttempt(db, 7, { ...payload, userId: 99 })
  assert.deepEqual(first.questionIds, [3, 1, 2])
  assert.equal(first.mode, 'exam')
  assert.equal((await listAttempts(db, 7, 2)).length, 1)
  assert.deepEqual(await listAttempts(db, 99, 2), [])
  assert.deepEqual(await listAttempts(db, 7, 3), [])
  await saveAttempt(db, 99, { ...payload, mode: 'practice', questionIds: [2, 3] })
  assert.equal((await listAttempts(db, 7, 2))[0].mode, 'exam')
  assert.equal((await listAttempts(db, 99, 2))[0].mode, 'practice')
  await saveAttempt(db, 0, payload)
  assert.equal((await listAttempts(db, 0, 2)).length, 1)
  assert.equal((await listAttempts(db, 7, 2)).length, 1)
  assert.equal((await db.execute('SELECT count(*) AS count FROM questions')).rows[0].count, 4)
}))

test('save retries are idempotent, preserve the completion time and reject conflicting reuse', () => fixture(async db => {
  const first = await saveAttempt(db, 7, payload)
  assert.deepEqual(await saveAttempt(db, 7, payload), first)
  assert.equal((await listAttempts(db, 7, 2)).length, 1)
  for (const changed of [{ ...payload, mode: 'practice' }, { ...payload, questionIds: [1, 2, 3] }, { ...payload, examId: 3 }]) {
    await assert.rejects(saveAttempt(db, 7, changed), error => error.statusCode === 409)
  }
}))

test('invalid inputs and questions from another exam are rejected without writing history', () => fixture(async db => {
  for (const changed of [null, {}, { ...payload, examId: 0 }, { ...payload, id: 'bad' },
    { ...payload, mode: 'other' }, { ...payload, questionIds: [] }, { ...payload, questionIds: [1, 1] },
    { ...payload, questionIds: ['1'] }, { ...payload, questionIds: [-1] },
    { ...payload, questionIds: Array.from({ length: 2001 }, (_, index) => index + 1) }]) {
    await assert.rejects(saveAttempt(db, 7, changed), error => error.statusCode === 400)
  }
  for (const questionIds of [[1, 4], [1, 99]]) {
    await assert.rejects(saveAttempt(db, 7, { ...payload, questionIds }), error => error.statusCode === 409)
  }
  await assert.rejects(saveAttempt(db, -1, payload), error => error.statusCode === 401)
  assert.deepEqual(await listAttempts(db, 7, 2), [])
}))

test('history is bounded to the latest 20 with deterministic ordering and other owners excluded', () => fixture(async db => {
  await db.batch(Array.from({ length: 25 }, (_, index) => ({
    sql: 'INSERT INTO exam_attempts (user_id, id, exam_id, mode, question_ids, completed_at) VALUES (?, ?, 2, ?, ?, ?)',
    args: [7, uuid(index + 1), 'practice', '[1,2]', `2026-10-30T10:00:${String(index).padStart(2, '0')}.000Z`]
  })), 'write')
  await saveAttempt(db, 8, payload)
  const rows = await listAttempts(db, 7, 2)
  assert.equal(rows.length, 20)
  assert.equal(rows[0].id, uuid(25))
  assert.equal(rows.at(-1).id, uuid(6))
}))

test('large saved draws validate in chunks and remain replayable in their original order', () => fixture(async db => {
  await db.batch(Array.from({ length: 1197 }, (_, index) => ({
    sql: 'INSERT INTO questions (id, exam_id, prompt, created_at, updated_at) VALUES (?, 2, ?, ?, ?)',
    args: [index + 5, 'Large bank fixture', 'antes', 'antes']
  })), 'write')
  const ids = [3, 2, 1, ...Array.from({ length: 1197 }, (_, index) => index + 5).reverse()]
  const saved = await saveAttempt(db, 7, { ...payload, questionIds: ids })
  assert.deepEqual(saved.questionIds, ids)
  await db.execute('DELETE FROM questions WHERE id = 1')
  assert.deepEqual((await listAttempts(db, 7, 2))[0].questionIds, ids)
  assert.deepEqual(await saveAttempt(db, 7, { ...payload, questionIds: ids }), saved)
}))
