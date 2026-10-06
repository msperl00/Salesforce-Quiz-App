import { authSession, emailAddress, rateLimit, tokenHash } from '~/server/utils/auth'
import { getDb, query } from '~/server/utils/database'
import { verifyPassword } from '~/server/database/passwords.mjs'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const email = emailAddress(body?.email)
  await rateLimit(email)
  const db = await getDb()
  const row = (await query(db, 'SELECT * FROM users WHERE email = ?', [email]))[0]
  const dummy = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64)
  const valid = await verifyPassword(body?.password, row ? String(row.password_hash) : dummy)
  if (!row || !valid) throw createError({ statusCode: 401, statusMessage: 'Correo o clave incorrectos.' })
  const session = await authSession(event)
  await session.clear()
  await session.update({ userId: Number(row.id), version: Number(row.session_version) })
  await query(db, 'DELETE FROM login_attempts WHERE key = ?', [tokenHash(email)])
  return { success: true }
})
