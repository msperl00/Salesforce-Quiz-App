export function questionTags(questions) {
  const tags = new Map()
  for (const question of questions) {
    for (const tag of question.tags) tags.set(tag.name, tag)
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function shuffledQuestions(questions, random = Math.random) {
  const result = [...questions]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const current = result[i]
    result[i] = result[j]
    result[j] = current
  }
  return result
}
