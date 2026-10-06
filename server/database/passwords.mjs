import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 }

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('La clave debe tener entre 12 y 128 caracteres.')
  }
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64, options)
  return `scrypt:${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false
  const [method, salt, hex] = encoded.split(':')
  if (method !== 'scrypt' || !salt || !hex) return false
  const hash = await scrypt(password, salt, 64, options)
  const expected = Buffer.from(hex, 'hex')
  return expected.length === hash.length && timingSafeEqual(expected, hash)
}
