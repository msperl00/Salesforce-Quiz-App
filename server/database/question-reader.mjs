export async function hydrateQuestions(db, rows, includeImage = false) {
  if (!rows.length) return []
  const answersByQuestion = new Map()
  const tagsByQuestion = new Map()

  // Fetch related records in bulk instead of making two remote calls per question.
  for (let offset = 0; offset < rows.length; offset += 500) {
    const ids = rows.slice(offset, offset + 500).map(row => row.id)
    const placeholders = ids.map(() => '?').join(',')
    const [answers, tags] = await db.batch([
      { sql: `SELECT question_id, id, text, is_correct FROM answers
          WHERE question_id IN (${placeholders}) ORDER BY position, id`, args: ids },
      { sql: `SELECT question_tags.question_id, tags.id, tags.name FROM tags
          JOIN question_tags ON question_tags.tag_id = tags.id
          WHERE question_tags.question_id IN (${placeholders}) ORDER BY tags.name COLLATE NOCASE`, args: ids }
    ], 'read')
    for (const answer of answers.rows) {
      const id = Number(answer.question_id)
      if (!answersByQuestion.has(id)) answersByQuestion.set(id, [])
      answersByQuestion.get(id).push({ id: Number(answer.id), text: String(answer.text), isCorrect: Boolean(answer.is_correct) })
    }
    for (const tag of tags.rows) {
      const id = Number(tag.question_id)
      if (!tagsByQuestion.has(id)) tagsByQuestion.set(id, [])
      tagsByQuestion.get(id).push({ id: Number(tag.id), name: String(tag.name) })
    }
  }
  return rows.map(row => ({
    id: Number(row.id), examId: Number(row.exam_id), prompt: String(row.prompt),
    imageDataUrl: includeImage ? String(row.image_data_url || '') : '',
    imageUrl: row.has_image || row.image_data_url ? `/api/questions/${row.id}/image?v=${encodeURIComponent(row.updated_at)}` : '',
    explanation: String(row.explanation || ''), note: String(row.note || ''),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    answers: answersByQuestion.get(Number(row.id)) || [],
    tags: tagsByQuestion.get(Number(row.id)) || []
  }))
}
