export function isReviewPending(question) {
  return /^Revisión Daypo \(\d{4}-\d{2}-\d{2}\): PENDIENTE\./m.test(question?.note || '')
}

export function examReadyQuestions(questions) {
  return questions.filter(question => !isReviewPending(question))
}
