import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeLanguage, supportedLanguages, translateUI, uiMessages } from '../utils/localization.mjs'

test('only Spanish, English and Italian are accepted as interface languages', () => {
  assert.deepEqual(supportedLanguages, ['es', 'en', 'it'])
  for (const language of supportedLanguages) assert.equal(normalizeLanguage(language), language)
  for (const invalid of [undefined, null, '', 'de', '<script>', '__proto__']) {
    assert.equal(normalizeLanguage(invalid), 'es')
  }
})

test('every translated interface message has both translations and matching parameters', () => {
  const parameters = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort()
  for (const [source, translations] of Object.entries(uiMessages)) {
    assert.equal(translations.length, 2, source)
    for (const text of translations) {
      assert.ok(typeof text === 'string' && text.length > 0, source)
      assert.deepEqual(parameters(text), parameters(source), source)
    }
  }
})

test('interface translations preserve counts and do not translate question-bank content', () => {
  assert.equal(translateUI('es', 'Todas ({count})', { count: 415 }), 'Todas (415)')
  assert.equal(translateUI('en', 'Todas ({count})', { count: 415 }), 'All (415)')
  assert.equal(translateUI('it', 'Todas ({count})', { count: 415 }), 'Tutte (415)')
  assert.equal(translateUI('it', 'Pregunta {current} de {total}', { current: 2, total: 10 }), 'Domanda 2 di 10')
  assert.equal(translateUI('en', 'Correo o clave incorrectos.'), 'Incorrect email or password.')
  assert.equal(translateUI('it', 'Corregir'), 'Correggi')
  assert.equal(translateUI('it', 'Which cocktail includes gin?'), 'Which cocktail includes gin?')
  assert.equal(translateUI('it', 'Etiqueta no conocida'), 'Etiqueta no conocida')
  assert.equal(translateUI('it', 'Todas ({count})'), 'Tutte ({count})')
  assert.equal(translateUI('invalid', 'Todas'), 'Todas')
})
