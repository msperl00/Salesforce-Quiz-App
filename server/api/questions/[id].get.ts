import { getQuestionById } from '~/server/utils/questions'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))

  return {
    question: getQuestionById(id)
  }
})
