export const learningMarker = '\n\nPara entenderlo y recordarlo:\n'

export function validateExplanations(entries, count = 415) {
  if (!Array.isArray(entries) || entries.length !== count) throw new Error(`Se esperan ${count} explicaciones.`)
  const seen = new Set()
  for (const entry of entries) {
    const number = entry.sourceNumber
    if (!Number.isInteger(number) || number < 1 || number > count || seen.has(number)) {
      throw new Error('Numeración incompleta o duplicada.')
    }
    seen.add(number)
    if (typeof entry.prompt !== 'string' || Number(entry.prompt.match(/^(\d+)\./)?.[1]) !== number
      || typeof entry.correctAnswer !== 'string' || !entry.correctAnswer.trim()
      || typeof entry.explanation !== 'string' || entry.explanation.trim().length < 30
      || entry.explanation.includes(learningMarker.trim()) || !Array.isArray(entry.sources)) {
      throw new Error(`Explicación ${number} no válida.`)
    }
    for (const source of entry.sources) {
      if (typeof source !== 'string' || !/^https:\/\//.test(source)) throw new Error(`Fuente no válida: ${number}.`)
      new URL(source)
    }
  }
}

export async function readExamSnapshot(db, examId) {
  if (!Number.isSafeInteger(examId) || examId <= 0) throw new Error('Selecciona un examen válido.')
  const results = await db.batch([
    { sql: 'SELECT * FROM exams WHERE id = ?', args: [examId] },
    { sql: 'SELECT * FROM questions WHERE exam_id = ? ORDER BY id', args: [examId] },
    { sql: 'SELECT * FROM answers WHERE question_id IN (SELECT id FROM questions WHERE exam_id = ?) ORDER BY id', args: [examId] },
    { sql: 'SELECT * FROM question_tags WHERE question_id IN (SELECT id FROM questions WHERE exam_id = ?) ORDER BY question_id, tag_id', args: [examId] },
    { sql: 'SELECT DISTINCT tags.* FROM tags JOIN question_tags ON tags.id = question_tags.tag_id JOIN questions ON questions.id = question_tags.question_id WHERE questions.exam_id = ? ORDER BY tags.id', args: [examId] }
  ], 'read')
  const [exams, questions, answers, questionTags, tags] = results.map(result => result.rows.map(row => ({ ...row })))
  if (exams.length !== 1) throw new Error('Examen no encontrado.')
  return { exam: exams[0], questions, answers, questionTags, tags }
}

export function planExplanations(snapshot, entries, count = 415) {
  validateExplanations(entries, count)
  if (snapshot.questions.length !== count) throw new Error('El banco ha cambiado: recuento inesperado.')
  const byPrompt = new Map(snapshot.questions.map(question => [question.prompt, question]))
  if (byPrompt.size !== count) throw new Error('Hay enunciados duplicados; revisar antes de actualizar.')
  const changes = []
  for (const entry of entries) {
    const question = byPrompt.get(entry.prompt)
    if (!question || Number(question.exam_id) !== Number(snapshot.exam.id)) throw new Error(`No coincide la pregunta ${entry.sourceNumber}.`)
    const correct = snapshot.answers.filter(answer => Number(answer.question_id) === Number(question.id) && Number(answer.is_correct) === 1)
    // Exact PDF-to-option transcription differences; never use fuzzy matching for a key.
    const transcription = {
      39: ['Focuses solely on wine and wine-related products', 'Focuses solely on wine and wine- related products'],
      81: ['China', 'In China'],
      207: ['Advocaa', 'Advocaat'],
      290: ['They are primarily rum- based', 'They are primarily rum-based'],
      363: ['Attracting new guests with a well-designed menú', 'Attracting new guests with a well- designed menu'],
      412: ['Egg White', 'Egg white']
    }[entry.sourceNumber]
    const expected = transcription && entry.correctAnswer === transcription[0] ? transcription[1] : entry.correctAnswer
    if (correct.length !== 1 || correct[0].text !== expected) throw new Error(`La clave de la pregunta ${entry.sourceNumber} ha cambiado.`)
    const before = question.explanation ?? ''
    const addition = entry.explanation.trim()
    const marker = before.indexOf(learningMarker)
    if (marker !== -1) {
      if (before.slice(marker + learningMarker.length) !== addition) throw new Error(`La pregunta ${entry.sourceNumber} ya tiene otro apoyo; no se sobrescribe.`)
      continue
    }
    changes.push({ id: Number(question.id), sourceNumber: entry.sourceNumber, before, after: before + learningMarker + addition })
  }
  return changes
}

export async function applyExplanations(db, snapshot, changes) {
  if (!changes.length) return 0
  const rows = new Map(snapshot.questions.map(question => [Number(question.id), question]))
  const byId = new Map(changes.map(change => [change.id, change]))
  if (byId.size !== changes.length || changes.some(change => !rows.has(change.id)
    || (rows.get(change.id).explanation ?? '') !== change.before || typeof change.after !== 'string')) {
    throw new Error('El plan no coincide con las explicaciones del examen.')
  }
  const transaction = await db.transaction('write')
  try {
    const current = await readExamSnapshot(transaction, Number(snapshot.exam.id))
    if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error('El examen cambió desde la copia previa. No se ha actualizado nada.')
    const now = new Date().toISOString()
    const results = await transaction.batch(changes.map(change => ({
      sql: 'UPDATE questions SET explanation = ?, updated_at = ? WHERE id = ? AND exam_id = ?',
      args: [change.after, now, change.id, Number(snapshot.exam.id)]
    })))
    if (results.some(result => result.rowsAffected !== 1)) throw new Error('No se pudieron actualizar todas las explicaciones.')
    const after = await readExamSnapshot(transaction, Number(snapshot.exam.id))
    const expected = { ...snapshot, questions: snapshot.questions.map(question => byId.has(Number(question.id))
      ? { ...question, explanation: byId.get(Number(question.id)).after, updated_at: now } : question) }
    if (JSON.stringify(after) !== JSON.stringify(expected)) throw new Error('La verificación detectó cambios ajenos a las explicaciones. Se cancela la actualización.')
    await transaction.commit()
    return changes.length
  } finally { transaction.close() }
}

export function planExplanationRestore(current, backup) {
  if (Number(current.exam.id) !== Number(backup.snapshot.exam.id)) throw new Error('La copia pertenece a otro examen.')
  const rows = new Map(current.questions.map(question => [Number(question.id), question]))
  return backup.changes.map(change => {
    const row = rows.get(change.id)
    if (!row || row.explanation !== change.after) throw new Error('Hay explicaciones modificadas después de esta copia. No se sobrescriben.')
    return { ...change, before: change.after, after: change.before }
  })
}
