import assert from 'node:assert/strict'
import test from 'node:test'
import { hydrateQuestions } from '../server/database/question-reader.mjs'
import { questionTags, shuffledQuestions } from '../utils/quiz.mjs'

function fixtures(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, exam_id: 2,
    prompt: `Question ${i + 1}`, created_at: '2026-10-14', updated_at: '2026-10-14',
    explanation: 'Explanation', note: 'Note', has_image: i === 0 }))
}

test('415 questions use one bulk read with two queries, preserving order and associations', async () => {
  const rows = fixtures(415).reverse()
  let calls = 0
  const db = { async batch(statements, mode) {
    calls++
    assert.equal(mode, 'read')
    assert.equal(statements.length, 2)
    assert.equal(statements[0].args.length, 415)
    assert.deepEqual(statements[0].args, rows.map(row => row.id))
    assert.deepEqual(statements[1].args, statements[0].args)
    return [
      { rows: rows.flatMap(row => [
        { question_id: row.id, id: row.id * 10, text: `Correct ${row.id}`, is_correct: 1 },
        { question_id: row.id, id: row.id * 10 + 1, text: `Wrong ${row.id}`, is_correct: 0 }
      ]) },
      { rows: rows.map(row => ({ question_id: row.id, id: 1, name: 'IBA' })) }
    ]
  } }
  const result = await hydrateQuestions(db, rows)
  assert.equal(calls, 1)
  assert.equal(result.length, 415)
  assert.deepEqual(result.map(q => q.id), rows.map(row => row.id))
  for (const q of result) {
    assert.equal(q.answers[0].text, `Correct ${q.id}`)
    assert.equal(q.answers[0].isCorrect, true)
    assert.equal(q.answers[1].isCorrect, false)
    assert.deepEqual(q.tags, [{ id: 1, name: 'IBA' }])
    assert.equal(q.imageDataUrl, '')
  }
  assert.match(result.find(q => q.id === 1).imageUrl, /^\/api\/questions\/1\/image\?v=/)
  assert.equal(result.find(q => q.id === 2).imageUrl, '')
})

test('bulk reads chunk large banks and skip empty banks', async () => {
  const sizes = []
  const db = { async batch(statements) {
    sizes.push(statements[0].args.length)
    return [{ rows: [] }, { rows: [] }]
  } }
  assert.deepEqual(await hydrateQuestions(db, []), [])
  assert.deepEqual(sizes, [])
  const result = await hydrateQuestions(db, fixtures(1201))
  assert.deepEqual(sizes, [500, 500, 201])
  assert.equal(result.length, 1201)
  assert.deepEqual(result[0].answers, [])
  assert.deepEqual(result[0].tags, [])
})

test('export retains images while normal lists omit image data', async () => {
  const db = { async batch() { return [{ rows: [] }, { rows: [] }] } }
  const rows = [{ ...fixtures(1)[0], image_data_url: 'data:image/png;base64,AQ==' }]
  assert.equal((await hydrateQuestions(db, rows))[0].imageDataUrl, '')
  assert.equal((await hydrateQuestions(db, rows, true))[0].imageDataUrl, rows[0].image_data_url)
})

test('bulk read failures propagate instead of rendering an incomplete bank', async () => {
  const db = { async batch() { throw Error('Offline') } }
  await assert.rejects(hydrateQuestions(db, fixtures(1)), /Offline/)
})

test('tags are unique and shuffling preserves every question without mutating the pool', () => {
  const original = [
    { id: 1, tags: [{ id: 1, name: 'IBA' }, { id: 2, name: 'Cafe' }] },
    { id: 2, tags: [{ id: 1, name: 'IBA' }] },
    { id: 3, tags: [] }
  ]
  assert.deepEqual(questionTags(original).map(t => t.name), ['Cafe', 'IBA'])
  assert.deepEqual(questionTags(original), [{ id: 2, name: 'Cafe', count: 1 }, { id: 1, name: 'IBA', count: 2 }])
  assert.deepEqual(questionTags([{ tags: [{ id: 1, name: 'IBA' }, { id: 1, name: 'IBA' }] }]),
    [{ id: 1, name: 'IBA', count: 1 }])
  assert.deepEqual(shuffledQuestions(original, () => 0).map(q => q.id), [2, 3, 1])
  assert.deepEqual(original.map(q => q.id), [1, 2, 3])
  assert.deepEqual(shuffledQuestions([]), [])
  assert.deepEqual(shuffledQuestions([original[0]]), [original[0]])
})
