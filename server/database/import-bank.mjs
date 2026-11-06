// Administrative file import: a new exam and its complete bank in one atomic batch.
export function validateQuestionBank(data) {
  if (data?.version !== 1 || typeof data.examName !== 'string' || !data.examName.trim() || data.examName.trim().length > 120) {
    throw new Error('El banco necesita version 1 y un nombre de examen válido.')
  }
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('El banco no contiene preguntas.')
  const questions = data.questions.map((question, index) => {
    const fail = () => { throw new Error(`Pregunta ${index + 1} inválida.`) }
    if (!question || typeof question.prompt !== 'string' || !question.prompt.trim()) fail()
    if (!Array.isArray(question.answers) || question.answers.length < 2
      || question.answers.some(a => !a || typeof a.text !== 'string' || !a.text.trim() || typeof a.isCorrect !== 'boolean')
      || !question.answers.some(a => a.isCorrect)) fail()
    if (!Array.isArray(question.tags) || question.tags.some(tag => typeof tag !== 'string' || !tag.trim())) fail()
    if (question.explanation != null && typeof question.explanation !== 'string') fail()
    if (question.note != null && typeof question.note !== 'string') fail()
    const imageDataUrl = question.imageDataUrl ?? ''
    if (typeof imageDataUrl !== 'string' || (imageDataUrl && (
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl)
      || Buffer.from(imageDataUrl.split(',')[1], 'base64').length > 2 * 1024 * 1024))) fail()
    return { prompt: question.prompt.trim(), imageDataUrl, explanation: (question.explanation || '').trim(),
      note: (question.note || '').trim(), tags: [...new Set(question.tags.map(tag => tag.trim()))],
      answers: question.answers.map(a => ({ text: a.text.trim(), isCorrect: a.isCorrect })) }
  })
  return { examName: data.examName.trim(), questions }
}

export async function importNewQuestionBank(db, data) {
  const bank = validateQuestionBank(data)
  const now = new Date().toISOString()
  // The unique exam name also prevents repeat or concurrent imports. A conflict
  // rolls the whole batch back, including questions, answers and tags.
  const statements = [{ sql: 'INSERT INTO exams (name) VALUES (?)', args: [bank.examName] }]
  for (const question of bank.questions) {
    statements.push({ sql: `INSERT INTO questions (exam_id, prompt, image_data_url, explanation, note, created_at, updated_at)
      VALUES ((SELECT id FROM exams WHERE name = ?), ?, ?, ?, ?, ?, ?)`,
    args: [bank.examName, question.prompt, question.imageDataUrl, question.explanation, question.note, now, now] })
    for (const [position, answer] of question.answers.entries()) statements.push({
      sql: 'INSERT INTO answers (question_id, text, is_correct, position) SELECT max(id), ?, ?, ? FROM questions',
      args: [answer.text, answer.isCorrect ? 1 : 0, position]
    })
    for (const name of question.tags) {
      statements.push({ sql: 'INSERT OR IGNORE INTO tags (name) VALUES (?)', args: [name] })
      statements.push({ sql: 'INSERT INTO question_tags (question_id, tag_id) SELECT (SELECT max(id) FROM questions), id FROM tags WHERE name = ?', args: [name] })
    }
  }
  const results = await db.batch(statements, 'write')
  return { examId: Number(results[0].lastInsertRowid), imported: bank.questions.length }
}
