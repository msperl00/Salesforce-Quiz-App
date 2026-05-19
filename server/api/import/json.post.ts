import { readBody } from 'h3'
import type { QuizExport } from '~/types/quiz'
import { importQuestions } from '~/server/utils/questions'

export default defineEventHandler(async (event) => {
  const body = await readBody<QuizExport & { replaceExisting?: boolean }>(event)

  return importQuestions(body, { replaceExisting: Boolean(body.replaceExisting) })
})
