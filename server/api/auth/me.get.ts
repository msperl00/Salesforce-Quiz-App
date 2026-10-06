import { accountsEnabled, currentUser } from '~/server/utils/auth'
export default defineEventHandler(async event => ({ enabled: accountsEnabled(), user: await currentUser(event) }))
