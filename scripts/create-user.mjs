import { openDatabase } from './database-client.mjs'
import { hashPassword } from '../server/database/passwords.mjs'

async function main() {
  const email = (process.env.QUIZ_ADMIN_EMAIL || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Configura QUIZ_ADMIN_EMAIL en .env.')
  const hash = await hashPassword(process.env.QUIZ_ADMIN_PASSWORD)
  const db = await openDatabase()
  try {
    if (process.argv.includes('--reset')) {
      const result = await db.execute({ sql: "UPDATE users SET password_hash = ?, role = 'admin', session_version = session_version + 1 WHERE email = ?", args: [hash, email] })
      if (!result.rowsAffected) throw new Error('No existe la cuenta. Ejecuta sin --reset para crearla.')
      console.log('Clave actualizada y sesiones anteriores revocadas.')
    } else {
      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] })
      if (existing.rows.length) throw new Error('La cuenta ya existe. Usa --reset para cambiar su clave.')
      await db.execute({ sql: "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", args: [email, hash] })
      console.log('Cuenta administradora creada.')
    }
  } finally { db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
