import type { Question } from '~/types/quiz'
import { initialCachedData } from '~/utils/async-cache.mjs'

export function useQuestionBank(api: ReturnType<typeof useQuizApi>) {
  // Nuxt transfers this data from SSR to the browser instead of fetching it again.
  return useAsyncData(`question-bank:${api.examId}`, () => api.listQuestions(), {
    default: () => [] as Question[],
    deep: false,
    getCachedData: initialCachedData
  })
}
