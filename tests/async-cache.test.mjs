import assert from 'node:assert/strict'
import test from 'node:test'
import { initialCachedData } from '../utils/async-cache.mjs'

test('navigation reuses the current app payload, including empty banks and anonymous accounts', () => {
  const bank = [{ id: 1 }]
  const app = { payload: { data: { 'question-bank:2': bank, empty: [], account: { enabled: true, user: null } } }, static: { data: {} } }
  assert.equal(initialCachedData('question-bank:2', app, { cause: 'initial' }), bank)
  assert.deepEqual(initialCachedData('empty', app, { cause: 'initial' }), [])
  assert.equal(initialCachedData('account', app, { cause: 'initial' }).user, null)
  assert.equal(initialCachedData('question-bank:3', app, { cause: 'initial' }), undefined)
  const otherApp = { payload: { data: {} }, static: { data: {} } }
  assert.equal(initialCachedData('question-bank:2', otherApp, { cause: 'initial' }), undefined)
})

test('manual refresh, mutation invalidation and watched changes bypass navigation cache', () => {
  const app = { payload: { data: { bank: [{ id: 1 }] } }, static: { data: {} } }
  for (const cause of ['refresh:manual', 'refresh:hook', 'watch']) {
    assert.equal(initialCachedData('bank', app, { cause }), undefined)
  }
})
