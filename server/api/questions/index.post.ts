import { readBody } from 'h3'
import type { QuestionPayload } from '~/types/quiz'
import { createQuestionRecord } from '~/server/utils/questions'

export default defineEventHandler(async (event) => {
  const body = await readBody<QuestionPayload>(event)

  return {
    question: createQuestionRecord(body)
  }
})
