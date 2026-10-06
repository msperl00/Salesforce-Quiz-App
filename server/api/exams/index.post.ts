import { saveExam } from '~/server/utils/questions'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return { exam: saveExam(body?.name) }
})
