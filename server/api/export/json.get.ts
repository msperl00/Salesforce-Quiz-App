import { exportQuestions } from '~/server/utils/questions'
import { getExamQuery } from '~/server/utils/exam-query'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="salesforce-quiz-export-${new Date().toISOString().slice(0, 10)}.json"`)

  const result = await exportQuestions(await getExamQuery(event))
  if (Buffer.byteLength(JSON.stringify(result)) > 4_000_000) {
    throw createError({ statusCode: 413, statusMessage: 'La exportacion es demasiado grande. Usa el exportador de la pantalla de preguntas.' })
  }
  return result
})
