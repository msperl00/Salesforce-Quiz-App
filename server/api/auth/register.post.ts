import { authSession, emailAddress, tokenHash } from '~/server/utils/auth'
import { getDb, query, transaction } from '~/server/utils/database'
import { hashPassword } from '~/server/database/passwords.mjs'

export default defineEventHandler(async event => {
  const session = await authSession(event)
  const body = await readBody(event)
  const email = emailAddress(body?.email)
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!/^[a-f0-9]{64}$/.test(token)) throw createError({ statusCode: 400, statusMessage: 'Invitacion invalida.' })
  const hash = tokenHash(token)
  const invite = (await query(await getDb(), 'SELECT email, expires_at FROM invitations WHERE token_hash = ?', [hash]))[0]
  if (!invite || invite.email !== email || Number(invite.expires_at) < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Invitacion invalida o caducada.' })
  }
  let passwordHash: string
  try { passwordHash = await hashPassword(body?.password) } catch {
    throw createError({ statusCode: 400, statusMessage: 'La clave debe tener entre 12 y 128 caracteres.' })
  }
  const id = await transaction(async db => {
    const removed = await db.execute({ sql: 'DELETE FROM invitations WHERE token_hash = ? AND email = ? AND expires_at >= ?', args: [hash, email, Date.now()] })
    if (!removed.rowsAffected) throw createError({ statusCode: 400, statusMessage: 'Invitacion ya utilizada.' })
    if ((await query(db, 'SELECT id FROM users WHERE email = ?', [email])).length) {
      throw createError({ statusCode: 409, statusMessage: 'Ya existe esta cuenta. Inicia sesion.' })
    }
    return Number((await db.execute({ sql: "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'member')", args: [email, passwordHash] })).lastInsertRowid)
  })
  await session.clear()
  await session.update({ userId: id, version: 1 })
  return { success: true }
})
