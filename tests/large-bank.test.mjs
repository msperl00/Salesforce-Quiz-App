import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import Database from 'better-sqlite3'

test('415-question list, filters, export and SSR stay complete and exam-scoped', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-large-bank-'))
  const path = join(dir, 'quiz.sqlite')
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', VERCEL: '',
      NUXT_AUTH_MODE: 'local', NUXT_TURSO_DATABASE_URL: '', NUXT_TURSO_AUTH_TOKEN: '',
      NUXT_QUIZ_DATABASE_PATH: path }
  })
  let logs = ''
  server.stdout.on('data', chunk => { logs += chunk })
  server.stderr.on('data', chunk => { logs += chunk })
  const get = async (endpoint, language) => {
    const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(20000),
      headers: language ? { cookie: `quiz-language=${language}` } : {} })
    assert.equal(response.status, 200, await response.clone().text())
    return response
  }
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  try {
    for (let i = 0; i < 100 && !logs.includes('Listening on'); i++) {
      if (server.exitCode !== null) throw Error(logs)
      await delay(100)
    }
    await get('/api/exams')
    const db = new Database(path)
    try {
      db.transaction(() => {
        db.exec("INSERT INTO exams (id, name) VALUES (2, 'Large bank'), (3, 'Other exam'); INSERT INTO tags (id, name) VALUES (1, 'Even'), (2, 'Odd')")
        const question = db.prepare(`INSERT INTO questions (id, exam_id, prompt, explanation, note, image_data_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        const answer = db.prepare('INSERT INTO answers (question_id, text, is_correct, position) VALUES (?, ?, ?, ?)')
        const tag = db.prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
        for (let id = 1; id <= 415; id++) {
          question.run(id, 2, `${id}. Fixture question`, `Explanation ${id}`, `Note ${id}`,
            id === 1 ? image : '', '2026-10-14', `2026-10-14:${String(id).padStart(3, '0')}`)
          for (let position = 0; position < 4; position++) answer.run(id, `Answer ${id}:${position}`, position === 1 ? 1 : 0, position)
          tag.run(id, id % 2 ? 2 : 1)
        }
        question.run(416, 3, 'Must stay in other exam', '', '', '', '2026-10-14', '2026-10-14')
        answer.run(416, 'Yes', 1, 0)
        answer.run(416, 'No', 0, 1)
      })()
    } finally { db.close() }
    const { questions } = await (await get('/api/questions?examId=2')).json()
    assert.equal(questions.length, 415)
    assert.equal(questions.reduce((n, q) => n + q.answers.length, 0), 1660)
    for (const q of questions) {
      assert.equal(q.examId, 2)
      assert.equal(q.answers[1].isCorrect, true)
      assert.equal(q.answers[0].isCorrect, false)
      assert.equal(q.answers[0].text, `Answer ${q.id}:0`)
      assert.equal(q.tags[0].name, q.id % 2 ? 'Odd' : 'Even')
    }
    const filtered = await (await get('/api/questions?examId=2&tag=Even')).json()
    assert.equal(filtered.questions.length, 207)
    assert.ok(filtered.questions.every(q => q.id % 2 === 0))
    const searched = await (await get('/api/questions?examId=2&search=Note%20415')).json()
    assert.equal(searched.questions.length, 1)
    assert.equal(searched.questions[0].id, 415)
    const exported = await (await get('/api/export/json?examId=2')).json()
    assert.equal(exported.questions.length, 415)
    assert.equal(exported.questions.find(q => q.prompt.startsWith('1. ')).imageDataUrl, image)
    const study = await (await get('/study?examId=2')).text()
    assert.match(study, /<title>Estudiar \| Salesforce Quiz<\/title>/)
    assert.match(study, /rel="icon"[^>]*href="\/favicon.svg"/)
    assert.ok(study.includes('class="study-controls"'))
    assert.ok(study.indexOf('Mostrar solución') < study.indexOf('1. Fixture question'))
    assert.ok(study.includes('Actualizar preguntas'))
    assert.ok(study.includes('1. Fixture question'))
    assert.ok(study.includes('question-bank:2'))
    assert.ok(!study.includes('Must stay in other exam'))
    const exam = await (await get('/exam?examId=2')).text()
    assert.ok(exam.includes('Todas (415)'))
    assert.ok(exam.includes('Even (207)'))
    assert.ok(exam.includes('Odd (208)'))
    assert.ok(exam.includes('415 preguntas disponibles'))
    assert.ok(exam.includes('Usar todas (415)'))
    const management = await (await get('/?examId=2')).text()
    assert.equal([...management.matchAll(/class="question-card"/g)].length, 25)
    assert.ok(management.includes('25')) // The serialized bank retains all questions beyond the visible page.
    const other = await (await get('/api/questions?examId=3')).json()
    assert.equal(other.questions.length, 1)
    assert.equal(other.questions[0].prompt, 'Must stay in other exam')
    const smallExam = await (await get('/exam?examId=3')).text()
    assert.ok(smallExam.includes('Todas (1)'))
    assert.match(smallExam, /<input(?=[^>]*id="count")(?=[^>]*value="1")[^>]*>/)
    for (const [language, labels] of [
      ['en', ['All (415)', 'Use all (415)', 'Generate random practice exam', 'Show answer']],
      ['it', ['Tutte (415)', 'Usa tutte (415)', 'Genera una simulazione casuale', 'Mostra la soluzione']]
    ]) {
      const localizedExam = await (await get('/exam?examId=2', language)).text()
      assert.match(localizedExam, new RegExp(`<html[^>]*lang="${language}"`))
      for (const text of labels.slice(0, 3)) assert.ok(localizedExam.includes(text), text)
      const localizedStudy = await (await get('/study?examId=2', language)).text()
      assert.ok(localizedStudy.includes(labels[3]))
      assert.ok(localizedStudy.includes('1. Fixture question'))
      assert.ok(localizedStudy.includes('Answer 1:0'))
      assert.ok(localizedStudy.includes('Explanation 1'))
    }
    const spanishAgain = await (await get('/exam?examId=2')).text()
    assert.match(spanishAgain, /<html[^>]*lang="es"/)
    assert.ok(spanishAgain.includes('Crear simulacro aleatorio'))
    const invalidLanguage = await (await get('/exam?examId=2', 'de')).text()
    assert.match(invalidLanguage, /<html[^>]*lang="es"/)
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  }
})
