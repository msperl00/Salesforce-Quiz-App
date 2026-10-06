import { getQuery, type H3Event } from 'h3'
import { getExam } from './questions'

export function getExamQuery(event: H3Event) {
  const id = Number(getQuery(event).examId)
  getExam(id)
  return id
}
