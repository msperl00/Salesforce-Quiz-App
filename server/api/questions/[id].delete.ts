import { deleteQuestionRecord } from '~/server/utils/questions'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))

  return deleteQuestionRecord(id)
})
