const marker = '\n\nPara entenderlo y recordarlo:\n'

export function pdfSolution(question) {
  const reference = question?.note?.match(/Clave:\s*(RESPUESTAS IBA 2025 Islas Baleares \(1\)\.pdf),\s*p[aá]gina\s+(\d+),\s*opci[oó]n\s+([a-d])\./i)
  if (!reference) return null
  const index = reference[3].toLowerCase().charCodeAt(0) - 97
  const answers = question.answers || []
  const consistent = Boolean(answers[index]) && answers.every((answer, position) => Boolean(answer.isCorrect) === (position === index))
  const explanation = question.explanation || ''
  const split = explanation.indexOf(marker)
  const original = split === -1 ? explanation : explanation.slice(0, split)
  const learning = split === -1 ? '' : explanation.slice(split + marker.length)
  const hasCaveat = /clave aportada marca|conviene revis|conviene matiz|solapan|advertencia de revisi[oó]n/i.test(learning + '\n' + original)
  return { file: reference[1], page: Number(reference[2]), letter: reference[3].toLowerCase(),
    answer: answers[index]?.text || '', consistent, original, learning, hasCaveat }
}

export function answerBadge(question, correct) {
  return pdfSolution(question)?.consistent
    ? correct ? 'Correcta según el PDF' : 'Incorrecta según el PDF'
    : correct ? 'Correcta' : 'Incorrecta'
}

export function answerFeedback(question, correct) {
  return pdfSolution(question)?.consistent
    ? correct ? 'Respuesta correcta según el PDF.' : 'Respuesta incorrecta según el PDF.'
    : correct ? 'Respuesta correcta.' : 'Respuesta incorrecta.'
}
