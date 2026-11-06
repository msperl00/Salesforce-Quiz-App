import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { migrateDatabase } from '../server/database/schema.mjs'
import { importNewQuestionBank } from '../server/database/import-bank.mjs'
import { questionFingerprint, planDaypoReview, saveDaypoReview } from '../scripts/review-daypo.mjs'
import { examReadyQuestions, isReviewPending } from '../utils/daypo-review.mjs'
import { replayQuestions } from '../utils/replay.mjs'

const source = [7, 44].map(number => ({ prompt: `Original scenario ${number}`, explanation: 'Original explanation',
  note: `Origen: Daypo · P${String(number).padStart(3, '0')}`, tags: ['Integration'],
  answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: false }] }))
const review = { date: '2026-11-06', updates: source.map((q, index) => ({
  ref: index ? 'P044' : 'P007', status: index ? 'pending' : 'corrected', ...(index ? {} : { correctIndex: 2 }),
  expectedHash: questionFingerprint(q), explanation: index ? 'Insufficient context.' : 'Versioned technical correction.',
  sources: ['https://developer.salesforce.com/docs/platform/platform-events/guide/platform-events-intro-emp.html']
})) }

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-daypo-review-'))
  const db = createClient({ url: pathToFileURL(join(directory, 'quiz.sqlite')).href })
  try {
    await migrateDatabase(db)
    const { examId } = await importNewQuestionBank(db, { version: 1, examName: 'Integration', questions: source })
    const read = async () => {
      const rows = (await db.execute({ sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY id', args: [examId] })).rows
      const answers = (await db.execute('SELECT * FROM answers ORDER BY question_id, position')).rows
      return rows.map(row => ({ ...row, answers: answers.filter(answer => answer.question_id === row.id)
        .map(answer => ({ ...answer, isCorrect: Boolean(answer.is_correct) })) }))
    }
    await run(db, examId, read)
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
}

test('review changes only an explicitly corrected key, preserves IDs and original questions, and quarantines ambiguous entries', () => fixture(async (db, examId, read) => {
  const before = await read()
  const plan = planDaypoReview(before, review)
  await saveDaypoReview(db, examId, plan)
  const after = await read()
  assert.deepEqual(after.map(q => q.id), before.map(q => q.id))
  assert.deepEqual(after.map(q => q.prompt), before.map(q => q.prompt))
  assert.deepEqual(after.map(q => q.image_data_url), before.map(q => q.image_data_url))
  assert.deepEqual(after[0].answers.map(a => a.isCorrect), [false, false, true])
  assert.deepEqual(after[1].answers.map(a => a.isCorrect), [true, false, false])
  assert.deepEqual(after.map(q => q.answers.map(a => a.id)), before.map(q => q.answers.map(a => a.id)))
  assert.equal(isReviewPending(after[1]), true)
  const ready = examReadyQuestions(after)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].id, after[0].id)
  assert.equal(replayQuestions(ready.map(q => ({ ...q, examId })), after.map(q => q.id), examId), null)
  assert.throws(() => planDaypoReview(after, review), /ya se revisó/)
}))

test('a concurrent question edit or wrong destination causes an atomic rollback', () => fixture(async (db, examId, read) => {
  const before = await read()
  const plan = planDaypoReview(before, review)
  await assert.rejects(saveDaypoReview(db, examId + 1, plan))
  assert.deepEqual(await read(), before)
  await db.execute({ sql: 'UPDATE questions SET explanation = ? WHERE id = ?', args: ['Concurrent edit', before[1].id] })
  await assert.rejects(saveDaypoReview(db, examId, plan))
  assert.deepEqual((await read())[0], before[0])
  assert.equal((await read())[1].explanation, 'Concurrent edit')
  assert.equal((await db.execute("SELECT count(*) AS n FROM sqlite_master WHERE name = 'daypo_review_guard'")).rows[0].n, 0)
}))

test('only the explicit note marker quarantines a question; normal notes and corrected entries remain available', () => {
  for (const note of ['', 'Pregunta ambigua en otro contexto', 'Revisión Daypo (2026-11-06): CORREGIDA.']) {
    assert.equal(isReviewPending({ note }), false)
  }
  assert.equal(isReviewPending({ note: 'Origen: Daypo · P044\nRevisión Daypo (2026-11-06): PENDIENTE. Clave original: A.' }), true)
})
