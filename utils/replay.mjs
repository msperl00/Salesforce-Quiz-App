export function replayQuestions(bank, ids, examId) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) return null
  const byId = new Map(bank.filter(question => question.examId === examId).map(question => [question.id, question]))
  const result = ids.map(id => byId.get(id))
  return result.some(question => !question) ? null : result
}
