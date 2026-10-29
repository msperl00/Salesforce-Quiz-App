import assert from 'node:assert/strict'
import test from 'node:test'
import { focusMovedOutside } from '../utils/focus.mjs'

test('Safari pointer blur without a related target keeps the menu available for its click', () => {
  const container = { contains: () => { throw new Error('No target should not be checked') } }
  assert.equal(focusMovedOutside(container, null), false)
  assert.equal(focusMovedOutside(container, undefined), false)
  assert.equal(focusMovedOutside(null, {}), false)
})

test('keyboard navigation closes the menu only after moving outside it', () => {
  const child = {}
  const container = { contains: target => target === child }
  assert.equal(focusMovedOutside(container, child), false)
  assert.equal(focusMovedOutside(container, {}), true)
})
