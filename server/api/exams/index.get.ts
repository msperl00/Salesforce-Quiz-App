import { listExams } from '~/server/utils/questions'

export default defineEventHandler(() => ({ exams: listExams() }))
