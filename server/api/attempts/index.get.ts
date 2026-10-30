import { currentUser } from '~/server/utils/auth'
import { getDb } from '~/server/utils/database'
import { getExamQuery } from '~/server/utils/exam-query'
import { listAttempts } from '~/server/database/attempts.mjs'

export default defineEventHandler(async event => {
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Inicia sesion.' })
  return { attempts: await listAttempts(await getDb(), user.id, await getExamQuery(event)) }
})
