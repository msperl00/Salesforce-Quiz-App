import assert from 'node:assert/strict'
import test from 'node:test'
import { answerBadge, answerFeedback, pdfSolution } from '../utils/pdf-solution.mjs'
import { evaluateSelection } from '../utils/exam-session.mjs'

function question(number = 97, letter = 'b', key = 'Malting') {
  const index = letter.charCodeAt(0) - 97
  return { id: number, prompt: `${number}. Pregunta de prueba`,
    note: `Clave: RESPUESTAS IBA 2025 Islas Baleares (1).pdf, pagina 3, opcion ${letter}.`,
    explanation: `Respuesta segun el solucionario aportado: ${letter}) ${key}.\n\nPara entenderlo y recordarlo:\nLa clave aportada marca ${key}; conviene revisar el concepto con otras fuentes.`,
    answers: Array.from({ length: 4 }, (_, position) => ({ id: position + 1, text: position === index ? key : `Otra ${position}`, isCorrect: position === index })) }
}

test('PDF solutions show the original letter, selected option and source page', () => {
  const value = question()
  const result = pdfSolution(value)
  assert.equal(result.consistent, true)
  assert.equal(result.letter, 'b')
  assert.equal(result.answer, 'Malting')
  assert.equal(result.page, 3)
  assert.equal(result.hasCaveat, true)
  assert.ok(!result.original.includes('Para entenderlo'))
  assert.match(result.learning, /conviene revisar/)
  assert.equal(pdfSolution({ ...value, note: value.note.replace('pagina', 'página').replace('opcion', 'opción') }).consistent, true)
})

test('external review suggestions never replace the PDF keys or change scoring', () => {
  for (const [number, letter, key] of [[97, 'b', 'Malting'], [170, 'a', 'Bianco'], [218, 'a', 'Water of life'],
    [304, 'b', 'High volume chain restaurants'], [344, 'c', 'Drink slowly and on a full stomach'],
    [369, 'd', '(Fixed costs + profit) / contribution rate'], [396, 'c', 'Orange slice or peel']]) {
    const value = question(number, letter, key)
    const before = JSON.stringify(value)
    assert.equal(pdfSolution(value).answer, key)
    assert.equal(pdfSolution(value).letter, letter)
    assert.equal(evaluateSelection(value, [letter.charCodeAt(0) - 96]), 'correct')
    assert.equal(JSON.stringify(value), before)
  }
})

test('questions from other sources keep generic labels and their original explanations', () => {
  for (const value of [{}, { note: 'Un PDF distinto', explanation: 'Mi explicación' },
    { note: 'Clave: otro.pdf, pagina 3, opcion b.' }]) {
    assert.equal(pdfSolution(value), null)
    assert.equal(answerBadge(value, true), 'Correcta')
    assert.equal(answerBadge(value, false), 'Incorrecta')
    assert.equal(answerFeedback(value, true), 'Respuesta correcta.')
  }
})

test('a mismatch, reordered key or multiple marked answers is never labeled as verified against the PDF', () => {
  const value = question()
  for (const answers of [[], value.answers.map(answer => ({ ...answer, isCorrect: false })),
    value.answers.map(answer => ({ ...answer, isCorrect: true })), [...value.answers].reverse()]) {
    const changed = { ...value, answers }
    assert.equal(pdfSolution(changed).consistent, false)
    assert.equal(answerBadge(changed, true), 'Correcta')
    assert.equal(answerFeedback(changed, false), 'Respuesta incorrecta.')
  }
})

test('PDF feedback is qualified and ordinary learning text stays separate from original review warnings', () => {
  const value = question()
  assert.equal(answerBadge(value, true), 'Correcta según el PDF')
  assert.equal(answerBadge(value, false), 'Incorrecta según el PDF')
  assert.equal(answerFeedback(value, true), 'Respuesta correcta según el PDF.')
  assert.equal(answerFeedback(value, false), 'Respuesta incorrecta según el PDF.')
  value.explanation = 'Respuesta segun el solucionario aportado: b) Malting. Advertencia de revision: matiz previo.\n\nPara entenderlo y recordarlo:\nUna asociación de memoria.'
  assert.equal(pdfSolution(value).hasCaveat, true)
  value.explanation = 'Respuesta segun el solucionario aportado: b) Malting.\n\nPara entenderlo y recordarlo:\nUna asociación de memoria.'
  assert.equal(pdfSolution(value).hasCaveat, false)
  assert.equal(pdfSolution(value).learning, 'Una asociación de memoria.')
  value.explanation = 'Respuesta original sin apoyo añadido.'
  assert.equal(pdfSolution(value).original, value.explanation)
  assert.equal(pdfSolution(value).learning, '')
})
