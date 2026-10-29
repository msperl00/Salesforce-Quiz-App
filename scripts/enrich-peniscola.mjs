import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { applyExplanations, planExplanations, planExplanationRestore, readExamSnapshot } from '../server/database/explanation-patch.mjs'

const args = process.argv.slice(2)
const allowed = new Set(['--apply', '--local'])
if (args.some(arg => !allowed.has(arg) && !/^--(?:exam-id|backup|restore)=.+$/.test(arg))) throw new Error('Argumento no reconocido.')
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const examId = Number(option('exam-id') || 2)
const apply = args.includes('--apply')
const restorePath = option('restore')
const directory = fileURLToPath(new URL('../content/peniscola-2026/', import.meta.url))

async function main() {
  let url = process.env.NUXT_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
  const authToken = process.env.NUXT_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
  if (args.includes('--local')) {
    if (url) throw new Error('Para una prueba local, elimina primero las variables de conexión remota.')
    const path = resolve(process.env.NUXT_QUIZ_DATABASE_PATH || process.env.QUIZ_DATABASE_PATH || './data/quiz.sqlite')
    await stat(path)
    url = pathToFileURL(path).href
  } else if (!url || !authToken || !/^libsql:\/\//.test(url)) {
    throw new Error('Configura la conexión de Turso en el archivo privado .env.')
  }
  const db = createClient({ url, authToken: args.includes('--local') ? undefined : authToken })
  try {
    const snapshot = await readExamSnapshot(db, examId)
    if (!/pe[ñn][ií]scola/i.test(snapshot.exam.name)) throw new Error('El examen seleccionado no es Peñíscola.')
    let changes
    if (restorePath) {
      const backup = JSON.parse(await readFile(resolve(restorePath), 'utf8'))
      if (backup.format !== 'quiz-explanation-backup-v1') throw new Error('Copia no reconocida.')
      changes = planExplanationRestore(snapshot, backup)
    } else {
      const files = (await readdir(directory)).filter(name => /^explanations-\d+-\d+\.json$/.test(name)).sort()
      const entries = (await Promise.all(files.map(async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'))))).flat()
      changes = planExplanations(snapshot, entries)
    }
    console.log(`${snapshot.exam.name}: ${snapshot.questions.length} preguntas; ${changes.length} explicaciones pendientes.`)
    if (!apply || !changes.length) {
      console.log(apply ? 'Sin cambios: ya estaban aplicadas.' : 'Solo comprobación. Usa --apply para actualizar únicamente las explicaciones.')
      return
    }
    const backupPath = resolve(option('backup') || `data/peniscola-explanations-${new Date().toISOString().replaceAll(':', '-')}.json`)
    await mkdir(dirname(backupPath), { recursive: true })
    await writeFile(backupPath, JSON.stringify({ format: 'quiz-explanation-backup-v1', savedAt: new Date().toISOString(), snapshot, changes }, null, 2), { mode: 0o600, flag: 'wx' })
    console.log(`Copia privada: ${backupPath}`)
    const updated = await applyExplanations(db, snapshot, changes)
    const after = await readExamSnapshot(db, examId)
    const expected = new Map(changes.map(change => [change.id, change.after]))
    if (after.questions.some(question => expected.has(Number(question.id)) && question.explanation !== expected.get(Number(question.id)))
      || JSON.stringify(after.answers) !== JSON.stringify(snapshot.answers)
      || JSON.stringify(after.questionTags) !== JSON.stringify(snapshot.questionTags)) throw new Error('Revisar la verificación posterior con la copia previa.')
    console.log(`Verificado: ${updated} explicaciones actualizadas. Opciones, claves y etiquetas conservadas.`)
  } finally { db.close() }
}

main().catch(error => {
  console.error(error instanceof Error && !error.code ? error.message : 'No se pudo completar la actualización. Revisa la conexión y la copia previa; no imprimas credenciales.')
  process.exitCode = 1
})
