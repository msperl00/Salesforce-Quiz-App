import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleQuestions } from '../utils/quiz.mjs'

const bank = Array.from({ length: 415 }, (_, i) => ({ id: i + 1, examId: 2 }))

test('random exams contain exactly X unique questions from the supplied pool without changing it', () => {
  const before = [...bank]
  for (const count of [1, 3, 10, 20, 50, 100, 414, 415]) {
    const sample = sampleQuestions(bank, count)
    assert.equal(sample.length, count)
    assert.equal(new Set(sample.map(q => q.id)).size, count)
    assert.ok(sample.every(q => bank.includes(q)))
    assert.notEqual(sample, bank)
  }
  assert.deepEqual(bank, before)
})

test('new draws reshuffle the pool and keep the selected exam and tag scope', () => {
  const filtered = bank.filter(q => q.id % 2 === 0)
  const first = sampleQuestions(filtered, 20, () => 0)
  const second = sampleQuestions(filtered, 20, () => 0.999)
  assert.notDeepEqual(first, second)
  for (const sample of [first, second]) {
    assert.ok(sample.every(q => q.id % 2 === 0 && q.examId === 2))
    assert.equal(sample.length, 20)
  }
})

test('invalid counts and empty pools never silently truncate or start an exam', () => {
  for (const count of [0, -1, 1.5, NaN, Infinity, '10', null, undefined, 416]) {
    assert.deepEqual(sampleQuestions(bank, count), [])
  }
  assert.deepEqual(sampleQuestions([], 1), [])
  assert.deepEqual(sampleQuestions([bank[0]], 1), [bank[0]])
})
