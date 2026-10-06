import { getExam } from '~/server/utils/questions'

export default defineEventHandler(async event => ({ exam: await getExam(Number(getRouterParam(event, 'id'))) }))
