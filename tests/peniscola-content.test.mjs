import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { validateExplanations } from '../server/database/explanation-patch.mjs'

const entries = (await Promise.all(['1-140', '141-280', '281-415'].map(async range =>
  JSON.parse(await readFile(new URL(`../content/peniscola-2026/explanations-${range}.json`, import.meta.url), 'utf8'))))).flat()

test('Peñíscola has 415 complete, uniquely numbered learning explanations with bounded length', () => {
  validateExplanations(entries)
  assert.deepEqual(entries.map(entry => entry.sourceNumber), Array.from({ length: 415 }, (_, index) => index + 1))
  assert.equal(new Set(entries.map(entry => entry.explanation)).size, 415)
  for (const entry of entries) {
    assert.ok(entry.explanation.length <= 1000, `Explicación ${entry.sourceNumber} demasiado larga`)
    assert.doesNotMatch(entry.explanation, /Lorem ipsum|texto de prueba/i)
    assert.doesNotMatch(entry.explanation, /\bTODO\b/)
  }
})

test('known disputed keys remain explicitly qualified rather than justified silently', () => {
  for (const number of [33, 210, 332, 342, 369, 396, 413]) {
    const entry = entries.find(entry => entry.sourceNumber === number)
    assert.match(entry.explanation, /clave|solucionario/i, `Falta contexto de la clave ${number}`)
    assert.match(entry.explanation, /revis|no |depende|contradic|difer|sin |matiz|pero |aunque /i, `Falta advertencia ${number}`)
  }
})
