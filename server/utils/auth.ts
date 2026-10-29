import { useSession, type H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { getDb, query } from './database'

export function accountsEnabled() {
  const config = useRuntimeConfig()
  return Boolean(process.env.VERCEL || config.tursoDatabaseUrl || config.authMode === 'accounts')
}

export function emailAddress(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Introduce un correo valido.' })
  }
  return value.trim().toLowerCase()
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')

export function authSession(event: H3Event) {
  const password = useRuntimeConfig().sessionPassword
  if (password.length < 32) throw createError({ statusCode: 503, statusMessage: 'Falta configurar la clave de sesiones.' })
  return useSession<{ userId: number, version: number }>(event, {
    name: 'quiz-session', password, sessionHeader: false, maxAge: 7 * 24 * 60 * 60,
    cookie: { httpOnly: true, secure: Boolean(process.env.VERCEL) || getRequestURL(event).protocol === 'https:', sameSite: 'lax', path: '/' }
  })
}

export async function currentUser(event: H3Event) {
  // Scope deduplication to this request, never across users or subsequent requests.
  event.context.quizUserLookup ??= resolveCurrentUser(event)
  return event.context.quizUserLookup
}

async function resolveCurrentUser(event: H3Event) {
  if (!accountsEnabled()) return { id: 0, email: 'Modo local', role: 'admin' }
  const session = await authSession(event)
  if (!session.data.userId) return null
  const row = (await query(await getDb(), 'SELECT id, email, role, session_version FROM users WHERE id = ?', [session.data.userId]))[0]
  if (!row || Number(row.session_version) !== session.data.version) return null
  return { id: Number(row.id), email: String(row.email), role: String(row.role) }
}

export async function rateLimit(email: string) {
  const db = await getDb()
  const key = tokenHash(email)
  const now = Date.now()
  const row = (await query(db, `INSERT INTO login_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at < ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
  [key, now + 15 * 60 * 1000, now, now]))[0]
  if (Number(row.attempts) > 10) throw createError({ statusCode: 429, statusMessage: 'Demasiados intentos. Espera 15 minutos.' })
}
