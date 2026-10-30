import { currentUser } from '~/server/utils/auth'
import { getDb } from '~/server/utils/database'
import { saveAttempt } from '~/server/database/attempts.mjs'

export default defineEventHandler(async event => {
  const user = await currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Inicia sesion.' })
  return { attempt: await saveAttempt(await getDb(), user.id, await readBody(event)) }
})
