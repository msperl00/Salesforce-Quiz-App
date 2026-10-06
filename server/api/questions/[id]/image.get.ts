import { getDb, query } from '~/server/utils/database'

export default defineEventHandler(async event => {
  const row = (await query(await getDb(), 'SELECT image_data_url FROM questions WHERE id = ?', [Number(getRouterParam(event, 'id'))]))[0]
  const match = String(row?.image_data_url || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/)
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Imagen no encontrada.' })
  setHeader(event, 'content-type', match[1])
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'x-content-type-options', 'nosniff')
  return Buffer.from(match[2], 'base64')
})
