import { getExam } from '~/server/utils/questions'

export default defineEventHandler(event => ({ exam: getExam(Number(getRouterParam(event, 'id'))) }))
