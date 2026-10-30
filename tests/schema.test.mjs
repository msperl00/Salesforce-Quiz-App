import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateDatabase } from '../server/database/schema.mjs'

const names = ['exams', 'questions', 'answers', 'tags', 'question_tags', 'users', 'invitations', 'login_attempts', 'questions_exam_id', 'exam_attempts', 'exam_attempts_owner']

test('an up-to-date schema only needs one read batch and no write transaction', async () => {
  let reads = 0
  const db = {
    async batch(statements, mode) {
      reads++
      assert.equal(statements.length, 2)
      assert.equal(mode, 'read')
      assert.deepEqual(statements[0].args, names)
      return [{ rows: names.map(name => ({ name })) },
        { rows: ['id', 'image_data_url', 'exam_id'].map(name => ({ name })) }]
    },
    async transaction() { throw Error('Must not write an up-to-date schema') }
  }
  await migrateDatabase(db)
  assert.equal(reads, 1)
})

test('missing objects or legacy columns still run the migration and commit', async () => {
  for (const fixture of [
    { names: names.slice(0, -1), columns: ['id', 'image_data_url', 'exam_id'] },
    { names, columns: ['id'] },
    { names: [], columns: [] }
  ]) {
    const sql = []
    let committed = false
    let closed = false
    const db = {
      async batch() {
        return [{ rows: fixture.names.map(name => ({ name })) },
          { rows: fixture.columns.map(name => ({ name })) }]
      },
      async transaction(mode) {
        assert.equal(mode, 'write')
        return {
          async execute(statement) {
            sql.push(statement)
            return { rows: statement.startsWith('PRAGMA') ? fixture.columns.map(name => ({ name })) : [] }
          },
          async commit() { committed = true },
          close() { closed = true }
        }
      }
    }
    await migrateDatabase(db)
    assert.ok(sql.some(statement => statement.startsWith('CREATE TABLE')))
    assert.ok(sql.some(statement => statement.startsWith('CREATE INDEX')))
    assert.equal(sql.some(statement => statement.includes('ADD COLUMN exam_id')), !fixture.columns.includes('exam_id'))
    assert.equal(sql.some(statement => statement.includes('ADD COLUMN image_data_url')), !fixture.columns.includes('image_data_url'))
    assert.equal(committed, true)
    assert.equal(closed, true)
  }
})
