import { exportQuestions } from '~/server/utils/questions'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="salesforce-quiz-export-${new Date().toISOString().slice(0, 10)}.json"`)

  return exportQuestions()
})
