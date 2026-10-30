import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

test('accounts protect pages, invitations, member writes and revoked sessions', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-auth-'))
  const env = { ...process.env, NUXT_QUIZ_DATABASE_PATH: join(dir, 'quiz.sqlite'),
    NUXT_TURSO_DATABASE_URL: '', NUXT_TURSO_AUTH_TOKEN: '', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '',
    NUXT_AUTH_MODE: 'accounts', NUXT_SESSION_PASSWORD: 'test-session-secret-32-characters-minimum',
    QUIZ_ADMIN_EMAIL: 'owner@example.com', QUIZ_ADMIN_PASSWORD: 'a-long-test-password' }
  const setup = spawnSync(process.execPath, ['scripts/create-user.mjs'], { env, encoding: 'utf8' })
  assert.equal(setup.status, 0, setup.stderr)
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...env, PORT: String(port), HOST: '127.0.0.1' } })
  let logs = ''
  server.stdout.on('data', chunk => { logs += chunk })
  server.stderr.on('data', chunk => { logs += chunk })
  async function request(path, { method = 'GET', body, cookie, origin, status = 200 } = {}) {
    const response = await fetch(base + path, { method, redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, status, `${path}: ${await response.clone().text()}`)
    return response
  }
  const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith('quiz-session=') && !value.startsWith('quiz-session=;'))?.split(';')[0]
  try {
    for (let i = 0; i < 100; i++) {
      if (logs.includes('Listening on')) break
      if (server.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    assert.equal((await request('/exams', { status: 302 })).headers.get('location'), '/login')
    const loginPage = await request('/login')
    assert.match(loginPage.headers.get('cache-control'), /private, no-store/)
    const icon = await request('/favicon.svg')
    assert.match(icon.headers.get('content-type'), /image\/svg\+xml/)
    assert.match(await icon.text(), /<svg/)
    await request('/favicon.ico', { status: 307 })
    await request('/api/exams', { status: 401 })
    await request('/api/questions/1/image', { status: 401 })
    await request('/api/attempts?examId=1', { status: 401 })
    await request('/api/attempts', { method: 'POST', body: {}, status: 401 })
    await request('/api/auth/login', { method: 'POST', body: { email: env.QUIZ_ADMIN_EMAIL, password: 'wrong' }, status: 401 })
    const login = await request('/api/auth/login', { method: 'POST', body: { email: env.QUIZ_ADMIN_EMAIL, password: env.QUIZ_ADMIN_PASSWORD } })
    const owner = sessionCookie(login)
    assert.ok(owner)
    assert.match(login.headers.get('set-cookie'), /HttpOnly/i)
    const ownerPage = await request('/exams', { cookie: owner })
    assert.match(ownerPage.headers.get('cache-control'), /private, no-store/)
    const ownerHtml = await ownerPage.text()
    assert.match(ownerHtml, /href="#main-content"/)
    assert.match(ownerHtml, /id="main-content"[^>]*tabindex="-1"/)
    assert.match(ownerHtml, /class="account-menu"/)
    assert.match(ownerHtml, /<label[^>]*for="interface-language"/)
    const exams = await (await request('/api/exams', { cookie: owner })).json()
    assert.equal(exams.exams[0].name, 'General')
    await request('/api/exams', { method: 'POST', cookie: owner, origin: 'https://evil.example', body: { name: 'Blocked' }, status: 403 })
    await request('/api/exams', { method: 'POST', cookie: owner, origin: base, body: { name: 'Admin exam' } })
    const invitation = await (await request('/api/admin/invitations', { method: 'POST', cookie: owner, body: { email: 'friend@example.com' } })).json()
    const token = invitation.path.split('#')[1]
    assert.ok(token)
    await request('/api/auth/register', { method: 'POST', body: { email: 'other@example.com', password: 'a-friend-password', token }, status: 400 })
    const registration = await request('/api/auth/register', { method: 'POST', body: { email: 'friend@example.com', password: 'a-friend-password', token } })
    const friend = sessionCookie(registration)
    assert.ok(friend)
    const me = await (await request('/api/auth/me', { cookie: friend })).json()
    assert.equal(me.user.role, 'member')
    const ownerMe = await (await request('/api/auth/me', { cookie: owner })).json()
    assert.equal(ownerMe.user.role, 'admin')
    const anonymousMe = await (await request('/api/auth/me')).json()
    assert.equal(anonymousMe.user, null)
    assert.equal((await (await request('/api/auth/me', { cookie: friend })).json()).user.role, 'member')
    await request('/exams', { cookie: friend })
    await request('/api/exams', { method: 'POST', cookie: friend, body: { name: 'Forbidden' }, status: 403 })
    await request('/api/admin/invitations', { method: 'POST', cookie: friend, body: { email: 'third@example.com' }, status: 403 })
    const question = (await (await request('/api/questions', { method: 'POST', cookie: owner,
      body: { examId: 1, prompt: 'History fixture', answers: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }], tags: [] } })).json()).question
    const attempt = { id: '00000000-0000-4000-8000-000000000001', examId: 1, mode: 'exam', questionIds: [question.id], userId: ownerMe.user.id }
    await request('/api/attempts', { method: 'POST', cookie: friend, body: attempt, origin: 'https://evil.example', status: 403 })
    await request('/api/attempts', { method: 'POST', cookie: friend, body: attempt, origin: base })
    await request('/api/attempts', { method: 'POST', cookie: friend, body: attempt })
    const friendHistory = (await (await request(`/api/attempts?examId=1&userId=${ownerMe.user.id}`, { cookie: friend })).json()).attempts
    assert.equal(friendHistory.length, 1)
    assert.deepEqual(friendHistory[0].questionIds, [question.id])
    assert.equal((await (await request('/api/attempts?examId=1', { cookie: owner })).json()).attempts.length, 0)
    await request('/api/attempts', { method: 'POST', cookie: owner, body: { ...attempt, mode: 'practice' } })
    assert.equal((await (await request('/api/attempts?examId=1', { cookie: friend })).json()).attempts[0].mode, 'exam')
    assert.equal((await (await request('/api/attempts?examId=1', { cookie: owner })).json()).attempts[0].mode, 'practice')
    await request('/api/questions', { method: 'POST', cookie: friend, body: { examId: 1, prompt: 'Forbidden' }, status: 403 })
    await request('/api/attempts/extra', { method: 'POST', cookie: friend, body: attempt, status: 403 })
    await request('/api/attempts', { method: 'POST', cookie: friend, body: { ...attempt, id: 'invalid' }, status: 400 })
    await request('/api/auth/register', { method: 'POST', body: { email: 'friend@example.com', password: 'a-friend-password', token }, status: 400 })
    for (let i = 0; i < 10; i++) await request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.com', password: 'wrong' }, status: 401 })
    await request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.com', password: 'wrong' }, status: 429 })
    const reset = spawnSync(process.execPath, ['scripts/create-user.mjs', '--reset'], { env, encoding: 'utf8' })
    assert.equal(reset.status, 0, reset.stderr)
    await request('/api/exams', { cookie: owner, status: 401 })
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited
    }
    await rm(dir, { recursive: true, force: true })
  }
})
