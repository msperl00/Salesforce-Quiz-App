import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { migrateDatabase } from '../server/database/schema.mjs'
import { copyQuestionBank } from '../server/database/migrate-bank.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('bank migration preserves IDs and accounts and refuses a nonempty destination atomically', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-bank-'))
  const db = createClient({ url: pathToFileURL(join(dir, 'quiz.sqlite')).href })
  try {
    await migrateDatabase(db)
    await db.execute("INSERT INTO users (email, password_hash, role) VALUES ('admin@example.com', 'hash', 'admin')")
    const records = [
      { table: 'exams', rows: [{ id: 9, name: 'Certification' }] },
      { table: 'questions', rows: [{ id: 12, exam_id: 9, prompt: 'Question', image_data_url: 'image', created_at: 'now', updated_at: 'now' }] },
      { table: 'answers', rows: [{ id: 7, question_id: 12, text: 'Answer', is_correct: 1, position: 0 }] },
      { table: 'tags', rows: [{ id: 3, name: 'Apex' }] },
      { table: 'question_tags', rows: [{ question_id: 12, tag_id: 3 }] }
    ]
    await copyQuestionBank(db, records)
    assert.equal((await db.execute('SELECT image_data_url FROM questions WHERE id = 12')).rows[0].image_data_url, 'image')
    assert.equal((await db.execute('SELECT question_id FROM answers WHERE id = 7')).rows[0].question_id, 12)
    assert.equal((await db.execute('SELECT count(*) AS total FROM users')).rows[0].total, 1)
    await assert.rejects(copyQuestionBank(db, records))
    assert.equal((await db.execute('SELECT count(*) AS total FROM questions')).rows[0].total, 1)
    assert.equal((await db.execute("SELECT count(*) AS total FROM sqlite_master WHERE name = 'migration_guard'")).rows[0].total, 0)
  } finally { db.close(); await rm(dir, { recursive: true, force: true }) }
})
