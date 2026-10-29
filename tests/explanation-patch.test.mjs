import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrateDatabase } from '../server/database/schema.mjs'
import { applyExplanations, learningMarker, planExplanations, planExplanationRestore, readExamSnapshot, validateExplanations } from '../server/database/explanation-patch.mjs'

const entries = [1, 2, 3].map(sourceNumber => ({ sourceNumber, prompt: `${sourceNumber}. Pregunta ficticia`,
  correctAnswer: `Respuesta ${sourceNumber}`, explanation: `Apoyo didáctico en castellano para recordar la respuesta ${sourceNumber}.`, sources: [] }))

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-explanations-'))
  const db = createClient({ url: pathToFileURL(join(directory, 'quiz.sqlite')).href })
  try {
    await migrateDatabase(db)
    await db.batch([
      "INSERT INTO exams (id, name) VALUES (2, 'Nacional Peñíscola'), (3, 'Otro examen')",
      "INSERT INTO users (email, password_hash) VALUES ('ficticio@example.test', 'hash')",
      "INSERT INTO tags (id, name) VALUES (1, 'Tema')",
      ...entries.flatMap(entry => [
        { sql: 'INSERT INTO questions (id, exam_id, prompt, explanation, note, image_data_url, created_at, updated_at) VALUES (?, 2, ?, ?, ?, ?, ?, ?)',
          args: [entry.sourceNumber, entry.prompt, `Explicación original ${entry.sourceNumber}`, 'Mi nota y advertencia', 'imagen', 'antes', 'antes'] },
        { sql: 'INSERT INTO answers (question_id, text, is_correct) VALUES (?, ?, 1), (?, ?, 0)',
          args: [entry.sourceNumber, entry.correctAnswer, entry.sourceNumber, 'Distractor'] },
        { sql: 'INSERT INTO question_tags (question_id, tag_id) VALUES (?, 1)', args: [entry.sourceNumber] }
      ]),
      "INSERT INTO questions (id, exam_id, prompt, explanation, created_at, updated_at) VALUES (4, 3, 'Otro examen', 'No modificar', 'antes', 'antes')"
    ], 'write')
    await run(db)
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
}

test('explanation plans match exact prompts and keys, not positional database IDs', () => fixture(async db => {
  const snapshot = await readExamSnapshot(db, 2)
  const original = JSON.stringify(snapshot)
  const plan = planExplanations(snapshot, [...entries].reverse(), 3)
  assert.equal(plan.length, 3)
  assert.equal(plan[0].id, 3)
  assert.equal(plan[0].after, `Explicación original 3${learningMarker}${entries[2].explanation}`)
  assert.equal(JSON.stringify(snapshot), original)
  assert.throws(() => planExplanations(snapshot, entries.map(entry => ({ ...entry, correctAnswer: 'Otra clave' })), 3), /clave/)
  assert.throws(() => planExplanations(snapshot, entries.map(entry => ({ ...entry, prompt: `${entry.sourceNumber}. Modificada` })), 3), /coincide/)
}))

test('incomplete, duplicate or malformed content is refused before touching the bank', () => {
  assert.throws(() => validateExplanations(entries, 415), /415/)
  assert.throws(() => validateExplanations([entries[0], entries[0], entries[2]], 3), /duplicada/)
  assert.throws(() => validateExplanations(entries.map(entry => ({ ...entry, explanation: '' })), 3), /válida/)
  assert.throws(() => validateExplanations(entries.map(entry => ({ ...entry, sources: ['javascript:alert(1)'] })), 3), /Fuente/)
})

test('only the six exact documented PDF transcription differences are accepted', () => {
  const transcriptions = new Map([
    [39, ['Focuses solely on wine and wine-related products', 'Focuses solely on wine and wine- related products']],
    [81, ['China', 'In China']], [207, ['Advocaa', 'Advocaat']],
    [290, ['They are primarily rum- based', 'They are primarily rum-based']],
    [363, ['Attracting new guests with a well-designed menú', 'Attracting new guests with a well- designed menu']],
    [412, ['Egg White', 'Egg white']]
  ])
  const complete = Array.from({ length: 415 }, (_, index) => {
    const number = index + 1
    return { ...entries[0], sourceNumber: number, prompt: `${number}. Pregunta`, correctAnswer: transcriptions.get(number)?.[0] || 'Clave' }
  })
  const snapshot = { exam: { id: 2 },
    questions: complete.map(entry => ({ id: entry.sourceNumber, exam_id: 2, prompt: entry.prompt, explanation: '' })),
    answers: complete.map(entry => ({ question_id: entry.sourceNumber, text: transcriptions.get(entry.sourceNumber)?.[1] || 'Clave', is_correct: 1 })) }
  assert.equal(planExplanations(snapshot, complete).length, 415)
  snapshot.answers[80].text = 'Una respuesta diferente'
  assert.throws(() => planExplanations(snapshot, complete), /clave de la pregunta 81/)
})

test('only explanations and update times change; other exams, keys, notes, images and users stay intact', () => fixture(async db => {
  const before = await readExamSnapshot(db, 2)
  const plan = planExplanations(before, entries, 3)
  assert.equal(await applyExplanations(db, before, plan), 3)
  const after = await readExamSnapshot(db, 2)
  assert.deepEqual(after.answers, before.answers)
  assert.deepEqual(after.tags, before.tags)
  assert.deepEqual(after.questionTags, before.questionTags)
  for (let i = 0; i < before.questions.length; i++) {
    const { explanation, updated_at, ...rest } = after.questions[i]
    const { explanation: oldExplanation, updated_at: oldTime, ...oldRest } = before.questions[i]
    assert.deepEqual(rest, oldRest)
    assert.equal(explanation, oldExplanation + learningMarker + entries[i].explanation)
    assert.notEqual(updated_at, oldTime)
  }
  assert.equal((await db.execute('SELECT explanation FROM questions WHERE id = 4')).rows[0].explanation, 'No modificar')
  assert.equal((await db.execute('SELECT count(*) AS count FROM users')).rows[0].count, 1)
  assert.deepEqual(planExplanations(after, entries, 3), [])
  const changed = entries.map(entry => ({ ...entry, explanation: entry.explanation + ' Nueva versión.' }))
  assert.throws(() => planExplanations(after, changed, 3), /no se sobrescribe/)
}))

test('a concurrent note or answer edit cancels the entire update', () => fixture(async db => {
  const before = await readExamSnapshot(db, 2)
  const plan = planExplanations(before, entries, 3)
  await db.execute("UPDATE questions SET note = 'Nota posterior' WHERE id = 2")
  await assert.rejects(applyExplanations(db, before, plan), /cambió/)
  assert.deepEqual((await readExamSnapshot(db, 2)).questions.map(row => row.explanation), before.questions.map(row => row.explanation))
  const fresh = await readExamSnapshot(db, 2)
  await db.execute("UPDATE answers SET text = 'Respuesta editada' WHERE question_id = 3 AND is_correct = 1")
  await assert.rejects(applyExplanations(db, fresh, plan), /cambió/)
}))

test('an update failure rolls back all explanations, including earlier successful rows', () => fixture(async db => {
  const before = await readExamSnapshot(db, 2)
  await db.execute("CREATE TRIGGER refuse_explanation BEFORE UPDATE ON questions WHEN NEW.id = 2 BEGIN SELECT RAISE(ABORT, 'fixture failure'); END")
  await assert.rejects(applyExplanations(db, before, planExplanations(before, entries, 3)))
  assert.deepEqual(await readExamSnapshot(db, 2), before)
}))

test('a malformed plan or a trigger that changes protected notes is refused atomically', () => fixture(async db => {
  const before = await readExamSnapshot(db, 2)
  const plan = planExplanations(before, entries, 3)
  await assert.rejects(applyExplanations(db, before, [{ ...plan[0], id: 4 }]), /plan no coincide/)
  await assert.rejects(applyExplanations(db, before, [plan[0], plan[0]]), /plan no coincide/)
  await db.execute("CREATE TRIGGER change_note AFTER UPDATE OF explanation ON questions WHEN NEW.id = 2 BEGIN UPDATE questions SET note = 'Unwanted change' WHERE id = 2; END")
  await assert.rejects(applyExplanations(db, before, plan), /cambios ajenos/)
  assert.deepEqual(await readExamSnapshot(db, 2), before)
}))

test('a backup restores only its explanations and never overwrites later edits', () => fixture(async db => {
  const before = await readExamSnapshot(db, 2)
  const changes = planExplanations(before, entries, 3)
  const backup = { snapshot: before, changes }
  await applyExplanations(db, before, changes)
  let current = await readExamSnapshot(db, 2)
  const restore = planExplanationRestore(current, backup)
  await applyExplanations(db, current, restore)
  current = await readExamSnapshot(db, 2)
  assert.deepEqual(current.questions.map(row => row.explanation), before.questions.map(row => row.explanation))
  await applyExplanations(db, current, planExplanations(current, entries, 3))
  await db.execute("UPDATE questions SET explanation = explanation || ' Mi aclaración posterior.' WHERE id = 1")
  current = await readExamSnapshot(db, 2)
  assert.throws(() => planExplanationRestore(current, backup), /No se sobrescriben/)
}))
