import { accountsEnabled, authSession } from '~/server/utils/auth'
export default defineEventHandler(async event => {
  if (accountsEnabled()) await (await authSession(event)).clear()
  return { success: true }
})
