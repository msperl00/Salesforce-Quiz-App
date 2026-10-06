import { getQuery, type H3Event } from 'h3'
import { getExam } from './questions'

export async function getExamQuery(event: H3Event) {
  const id = Number(getQuery(event).examId)
  await getExam(id)
  return id
}
