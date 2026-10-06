import { getQuery } from 'h3'
import { listQuestions } from '~/server/utils/questions'
import { getExamQuery } from '~/server/utils/exam-query'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  return {
    questions: await listQuestions({
      examId: await getExamQuery(event),
      search: typeof query.search === 'string' ? query.search : undefined,
      tag: typeof query.tag === 'string' ? query.tag : undefined
    })
  }
})
