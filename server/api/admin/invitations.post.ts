import { randomBytes } from 'node:crypto'
import { emailAddress, tokenHash } from '~/server/utils/auth'
import { getDb, query } from '~/server/utils/database'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  const email = emailAddress(body?.email)
  const db = await getDb()
  if ((await query(db, 'SELECT id FROM users WHERE email = ?', [email])).length) {
    throw createError({ statusCode: 409, statusMessage: 'La cuenta ya existe.' })
  }
  const token = randomBytes(32).toString('hex')
  await query(db, 'INSERT INTO invitations (token_hash, email, expires_at) VALUES (?, ?, ?)', [tokenHash(token), email, Date.now() + 48 * 60 * 60 * 1000])
  return { path: `/register#${token}`, email }
})
