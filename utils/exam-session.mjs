export function allowsMultipleAnswers(question) {
  return question.answers.filter(answer => answer.isCorrect).length > 1
}

export function selectAnswer(question, selection, answerId, checked) {
  if (!question.answers.some(answer => answer.id === answerId)) return [...selection]
  if (!checked) return selection.filter(id => id !== answerId)
  if (!allowsMultipleAnswers(question)) return [answerId]
  return [...new Set([...selection, answerId])]
}

export function evaluateSelection(question, selection) {
  const selected = new Set(selection)
  if (!selected.size) return 'unanswered'
  const correct = new Set(question.answers.filter(answer => answer.isCorrect).map(answer => answer.id))
  if ([...selected].some(id => !correct.has(id))) return 'incorrect'
  return selected.size === correct.size ? 'correct' : 'partial'
}

export function canRevealAnswers(mode, submitted, selection) {
  return Boolean(submitted || (mode === 'practice' && selection.length > 0))
}
