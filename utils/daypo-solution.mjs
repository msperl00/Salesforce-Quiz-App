export const daypoClarificationMarker = '\n\nAclaración técnica (no cambia la clave Daypo):\n'

export function daypoSolution(question) {
  const reference = question?.note?.match(/^Clave Daypo: ([A-Z](?:, [A-Z])*)\./m)
  if (!reference) return null
  const letters = reference[1].split(', ')
  const indexes = new Set(letters.map(letter => letter.charCodeAt(0) - 65))
  const answers = question.answers || []
  const consistent = [...indexes].every(index => Boolean(answers[index]))
    && answers.every((answer, index) => Boolean(answer.isCorrect) === indexes.has(index))
  const explanation = question.explanation || ''
  const split = explanation.indexOf(daypoClarificationMarker)
  return { letters: reference[1], answers: [...indexes].map(index => answers[index]?.text || ''), consistent,
    original: split < 0 ? explanation : explanation.slice(0, split),
    clarification: split < 0 ? '' : explanation.slice(split + daypoClarificationMarker.length) }
}
