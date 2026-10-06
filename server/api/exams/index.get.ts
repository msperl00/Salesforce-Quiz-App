import { listExams } from '~/server/utils/questions'

export default defineEventHandler(async () => ({ exams: await listExams() }))
