import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import Database from 'better-sqlite3'

test('migration, exam isolation, rename and scoped JSON replacement', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-exams-test-'))
  const databasePath = join(dir, 'legacy.sqlite')
  const legacy = new Database(databasePath)
  legacy.exec(`
    CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt TEXT NOT NULL,
      explanation TEXT DEFAULT '', note TEXT DEFAULT '', image_data_url TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO questions (prompt, note, created_at, updated_at)
      VALUES ('Legacy question', 'Preserve me', '2026-01-01', '2026-01-01');
  `)
  legacy.close()
  const portProbe = createServer()
  portProbe.listen(0, '127.0.0.1')
  await once(portProbe, 'listening')
  const port = portProbe.address().port
  await new Promise(resolve => portProbe.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: resolve('.'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NUXT_QUIZ_DATABASE_PATH: databasePath }
  })
  let logs = ''
  server.stdout.on('data', chunk => { logs += chunk })
  server.stderr.on('data', chunk => { logs += chunk })
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
    })
    assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`)
    return response.json()
  }
  const payload = (examId, prompt, tag) => ({ examId, prompt, explanation: 'Explanation', note: '',
    tags: [tag], answers: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }],
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' })
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (logs.includes('Listening on')) break
      if (server.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    const { exams } = await request('/api/exams')
    assert.equal(exams.length, 1)
    assert.equal(exams[0].name, 'General')
    assert.equal(exams[0].questionCount, 1)
    const general = exams[0].id
    const old = await request(`/api/questions?examId=${general}`)
    assert.equal(old.questions[0].note, 'Preserve me')
    assert.equal(old.questions[0].examId, general)
    const { exam: a } = await request('/api/exams', 'POST', { name: 'Administrator' })
    const { exam: b } = await request('/api/exams', 'POST', { name: 'Developer' })
    assert.equal((await request(`/api/questions?examId=${b.id}`)).questions.length, 0)
    const { question: qa } = await request('/api/questions', 'POST', payload(a.id, 'Admin only', 'Security'))
    const { question: qb } = await request('/api/questions', 'POST', payload(b.id, 'Dev only', 'Apex'))
    assert.deepEqual((await request(`/api/tags?examId=${a.id}`)).tags.map(t => t.name), ['Security'])
    assert.equal((await request(`/api/questions?examId=${a.id}`)).questions[0].id, qa.id)
    await request(`/api/exams/${general}`, 'PUT', { name: 'My certification' })
    assert.equal((await request(`/api/questions?examId=${general}`)).questions.length, 1)
    await request('/api/exams', 'POST', { name: 'administrator' }, 409)
    await request('/api/questions?examId=999999', 'GET', undefined, 404)
    await request('/api/questions', 'GET', undefined, 400)
    const exported = await request(`/api/export/json?examId=${a.id}`)
    assert.equal(exported.examName, 'Administrator')
    assert.equal(exported.questions.length, 1)
    assert.equal(exported.questions[0].imageDataUrl, qa.imageDataUrl)
    await request(`/api/import/json?examId=${a.id}`, 'POST', {
      questions: [payload(b.id, 'Replacement', 'New topic')], replaceExisting: true
    })
    const remaining = (await request(`/api/questions?examId=${b.id}`)).questions
    assert.equal(remaining[0].id, qb.id)
    assert.equal(remaining[0].answers.length, 2)
    assert.equal(remaining[0].tags[0].name, 'Apex')
    assert.equal((await request(`/api/questions?examId=${a.id}`)).questions[0].prompt, 'Replacement')
    await request(`/api/import/json?examId=${a.id}`, 'POST', {
      replaceExisting: true, questions: [payload(a.id, 'Must roll back', 'Temporary'), { prompt: '' }]
    }, 400)
    assert.equal((await request(`/api/questions?examId=${a.id}`)).questions[0].prompt, 'Replacement')
    for (const path of ['/exams', `/?examId=${a.id}`, `/study?examId=${a.id}`, `/exam?examId=${b.id}`]) {
      const response = await fetch(base + path)
      assert.equal(response.status, 200, path)
      const html = await response.text()
      for (const [, src] of html.matchAll(/<script[^>]* src="([^\"]+)"/g)) {
        const asset = await fetch(base + src)
        assert.equal(asset.status, 200, `Missing script: ${src}`)
        assert.match(asset.headers.get('content-type') || '', /javascript/)
      }
      if (path.startsWith('/study')) {
        assert.ok(html.includes('Replacement'))
        assert.ok(!html.includes('Dev only'))
      }
    }
    const redirect = await fetch(base + '/', { redirect: 'manual' })
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), '/exams')
    await request(`/api/questions/${qb.id}`, 'PUT', payload(a.id, 'Moved question', 'Apex'))
    assert.equal((await request(`/api/questions?examId=${b.id}`)).questions.length, 0)
    assert.equal((await request(`/api/questions?examId=${a.id}`)).questions.length, 2)
    await request(`/api/questions/${qb.id}`, 'PUT', payload(999999, 'Invalid move', 'Apex'), 404)
    assert.equal((await request(`/api/questions/${qb.id}`)).question.examId, a.id)
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill('SIGTERM')
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  }
})
