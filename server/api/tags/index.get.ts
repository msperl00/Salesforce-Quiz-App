import { listTags } from '~/server/utils/questions'
import { getExamQuery } from '~/server/utils/exam-query'

export default defineEventHandler(async (event) => {
  return {
    tags: await listTags(await getExamQuery(event))
  }
})
