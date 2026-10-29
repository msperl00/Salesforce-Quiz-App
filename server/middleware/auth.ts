import { accountsEnabled, currentUser } from '~/server/utils/auth'

export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname
  if (path.startsWith('/_nuxt/') || path === '/favicon.ico' || path === '/favicon.svg' || path === '/__nuxt_error') return
  setHeader(event, 'cache-control', 'private, no-store')
  if (path.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(event.method)) {
      const origin = getHeader(event, 'origin')
      if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Origen no permitido.' })
      if (!(getHeader(event, 'content-type') || '').startsWith('application/json')) {
        throw createError({ statusCode: 415, statusMessage: 'Usa JSON.' })
      }
      if (Number(getHeader(event, 'content-length') || 0) > 3_500_000) throw createError({ statusCode: 413, statusMessage: 'Archivo demasiado grande.' })
    }
  }
  if (!accountsEnabled()) return
  const publicPaths = ['/login', '/register', '/api/auth/login', '/api/auth/register', '/api/auth/me', '/api/auth/logout']
  if (publicPaths.includes(path)) return
  const user = await currentUser(event)
  if (!user) {
    if (path.startsWith('/api/')) throw createError({ statusCode: 401, statusMessage: 'Inicia sesion.' })
    return sendRedirect(event, '/login')
  }
  event.context.quizUser = user
  if (path.startsWith('/api/') && (path.startsWith('/api/admin/') || !['GET', 'HEAD'].includes(event.method)) && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Solo el administrador puede modificar el banco de preguntas.' })
  }
})
