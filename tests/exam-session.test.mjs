import assert from 'node:assert/strict'
import test from 'node:test'
import { allowsMultipleAnswers, canRevealAnswers, evaluateSelection, selectAnswer } from '../utils/exam-session.mjs'

const single = { answers: [
  { id: 1, isCorrect: false }, { id: 2, isCorrect: true }, { id: 3, isCorrect: false }
] }
const multiple = { answers: [
  { id: 1, isCorrect: true }, { id: 2, isCorrect: false }, { id: 3, isCorrect: true }
] }

test('single-answer questions replace the previous selection without mutating it', () => {
  assert.equal(allowsMultipleAnswers(single), false)
  const previous = [1]
  assert.deepEqual(selectAnswer(single, previous, 2, true), [2])
  assert.deepEqual(previous, [1])
  assert.deepEqual(selectAnswer(single, [2], 2, false), [])
  assert.deepEqual(selectAnswer(single, [2], 99, true), [2])
})

test('multiple-answer questions support independent checked options and removal', () => {
  assert.equal(allowsMultipleAnswers(multiple), true)
  assert.deepEqual(selectAnswer(multiple, [1], 3, true), [1, 3])
  assert.deepEqual(selectAnswer(multiple, [1, 3], 3, true), [1, 3])
  assert.deepEqual(selectAnswer(multiple, [1, 3], 1, false), [3])
})

test('single-answer grading distinguishes unanswered, wrong and correct choices', () => {
  assert.equal(evaluateSelection(single, []), 'unanswered')
  assert.equal(evaluateSelection(single, [1]), 'incorrect')
  assert.equal(evaluateSelection(single, [2]), 'correct')
  assert.equal(evaluateSelection(single, [1, 2]), 'incorrect')
  assert.equal(evaluateSelection(single, [99]), 'incorrect')
})

test('incomplete multiple selections are not called wrong until a wrong option is chosen', () => {
  const selected = [3, 1]
  assert.equal(evaluateSelection(multiple, [1]), 'partial')
  assert.equal(evaluateSelection(multiple, [3]), 'partial')
  assert.equal(evaluateSelection(multiple, selected), 'correct')
  assert.equal(evaluateSelection(multiple, [1, 2, 3]), 'incorrect')
  assert.deepEqual(selected, [3, 1])
})

test('practice reveals feedback immediately after a choice, but not on an untouched question', () => {
  assert.equal(canRevealAnswers('practice', false, []), false)
  assert.equal(canRevealAnswers('practice', false, [1]), true)
  assert.equal(canRevealAnswers('practice', true, []), true)
})

test('real exam never reveals feedback before submitting, including changed and multiple choices', () => {
  for (const selection of [[], [1], [2], [1, 3], [1, 2, 3]]) {
    assert.equal(canRevealAnswers('exam', false, selection), false)
    assert.equal(canRevealAnswers('exam', true, selection), true)
  }
  assert.equal(canRevealAnswers('unknown', false, [1]), false)
})
