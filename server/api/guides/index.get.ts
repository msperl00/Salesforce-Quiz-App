import { getDb } from '~/server/utils/database'
import { getExamQuery } from '~/server/utils/exam-query'
import { getExam } from '~/server/utils/questions'
import { readGuideIndex } from '~/server/database/study-guide.mjs'

export default defineEventHandler(async event => {
  const examId = await getExamQuery(event)
  await getExam(examId)
  return { guide: await readGuideIndex(await getDb(), examId) }
})
