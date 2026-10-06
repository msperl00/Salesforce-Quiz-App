import { getQuestionById } from '~/server/utils/questions'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  return {
    question: await getQuestionById(id)
  }
})
