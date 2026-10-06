export default defineNuxtRouteMiddleware(async to => {
  if (['/login', '/register'].includes(to.path)) return
  const { data } = await useAccount()
  if (data.value?.enabled && !data.value.user) return navigateTo('/login')
  if (to.path === '/users' && data.value?.user?.role !== 'admin') return navigateTo('/exams')
})
