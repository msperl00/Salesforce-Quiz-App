export default defineNuxtRouteMiddleware((to) => {
  if (['/', '/study', '/exam'].includes(to.path)) {
    const id = Number(to.query.examId)
    if (!Number.isSafeInteger(id) || id <= 0) return navigateTo('/exams', { replace: true })
  }
})
