import { getQuery, type H3Event } from 'h3'

export async function getExamQuery(event: H3Event) {
  const id = Number(getQuery(event).examId)
  // The data operation checks existence; avoid the same remote query twice.
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Selecciona un examen valido.' })
  }
  return id
}
