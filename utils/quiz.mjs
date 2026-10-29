export function questionTags(questions) {
  const tags = new Map()
  for (const question of questions) {
    const counted = new Set()
    for (const tag of question.tags) {
      if (counted.has(tag.name)) continue
      counted.add(tag.name)
      tags.set(tag.name, { ...tag, count: (tags.get(tag.name)?.count || 0) + 1 })
    }
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

export function sampleQuestions(questions, count, random = Math.random) {
  if (!Number.isSafeInteger(count) || count < 1 || count > questions.length) return []
  return shuffledQuestions(questions, random).slice(0, count)
}
