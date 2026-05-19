import { readBody } from 'h3'
import type { QuestionPayload } from '~/types/quiz'
import { updateQuestionRecord } from '~/server/utils/questions'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<QuestionPayload>(event)

  return {
    question: updateQuestionRecord(id, body)
  }
})
