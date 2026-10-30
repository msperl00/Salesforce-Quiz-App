export class AttemptError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
    this.statusMessage = message
  }
}

function validOwner(userId) {
  if (!Number.isSafeInteger(userId) || userId < 0) throw new AttemptError(401, 'Inicia sesion.')
}

function validExam(examId) {
  if (!Number.isSafeInteger(examId) || examId <= 0) throw new AttemptError(400, 'Selecciona un examen valido.')
}

function hydrate(row) {
  return { id: String(row.id), examId: Number(row.exam_id), mode: String(row.mode),
    questionIds: JSON.parse(String(row.question_ids)), completedAt: String(row.completed_at) }
}

export async function listAttempts(db, userId, examId) {
  validOwner(userId)
  validExam(examId)
  return (await db.execute({ sql: `SELECT id, exam_id, mode, question_ids, completed_at FROM exam_attempts
    WHERE user_id = ? AND exam_id = ? ORDER BY completed_at DESC, id DESC LIMIT 20`, args: [userId, examId] })).rows.map(hydrate)
}

export async function saveAttempt(db, userId, payload) {
  validOwner(userId)
  const { id, examId, mode, questionIds } = payload || {}
  validExam(examId)
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
    || !['practice', 'exam'].includes(mode) || !Array.isArray(questionIds) || !questionIds.length || questionIds.length > 2000
    || questionIds.some(value => !Number.isSafeInteger(value) || value <= 0) || new Set(questionIds).size !== questionIds.length) {
    throw new AttemptError(400, 'Simulacro no valido.')
  }
  const encoded = JSON.stringify(questionIds)
  const find = () => db.execute({ sql: 'SELECT * FROM exam_attempts WHERE user_id = ? AND id = ?', args: [userId, id] })
  const existing = (await find()).rows[0]
  if (!existing) {
    let found = 0
    for (let offset = 0; offset < questionIds.length; offset += 500) {
      const ids = questionIds.slice(offset, offset + 500)
      found += (await db.execute({ sql: `SELECT id FROM questions WHERE exam_id = ? AND id IN (${ids.map(() => '?').join(',')})`, args: [examId, ...ids] })).rows.length
    }
    if (found !== questionIds.length) throw new AttemptError(409, 'Las preguntas han cambiado. Actualiza el banco antes de guardar.')
    await db.execute({ sql: `INSERT INTO exam_attempts (user_id, id, exam_id, mode, question_ids, completed_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO NOTHING`,
    args: [userId, id, examId, mode, encoded, new Date().toISOString()] })
  }
  const stored = existing || (await find()).rows[0]
  if (Number(stored.exam_id) !== examId || stored.mode !== mode || stored.question_ids !== encoded) {
    throw new AttemptError(409, 'Este intento ya se guardo con otra configuracion.')
  }
  return hydrate(stored)
}
