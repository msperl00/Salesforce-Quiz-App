import { listTags } from '~/server/utils/questions'
import { getExamQuery } from '~/server/utils/exam-query'

export default defineEventHandler((event) => {
  return {
    tags: listTags(getExamQuery(event))
  }
})
