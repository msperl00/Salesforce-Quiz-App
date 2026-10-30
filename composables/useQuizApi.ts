import type { AttemptPayload, SavedAttempt, Question, QuestionPayload, QuizExport, Tag } from '~/types/quiz'

export function useQuizApi() {
  const $fetch = useRequestFetch()
  const examId = Number(useRoute().query.examId)
  async function listQuestions(params?: { search?: string, tag?: string }) {
    const query = new URLSearchParams()
    query.set('examId', String(examId))

    if (params?.search) {
      query.set('search', params.search)
    }

    if (params?.tag) {
      query.set('tag', params.tag)
    }

    const suffix = query.toString() ? `?${query.toString()}` : ''
    const response = await $fetch<{ questions: Question[] }>(`/api/questions${suffix}`)

    return response.questions
  }

  async function listTags() {
    const response = await $fetch<{ tags: Tag[] }>('/api/tags', { query: { examId } })

    return response.tags
  }

  async function createQuestion(payload: QuestionPayload) {
    const response = await $fetch<{ question: Question }>('/api/questions', {
      method: 'POST',
      body: { ...payload, examId }
    })

    return response.question
  }

  async function updateQuestion(id: number, payload: QuestionPayload) {
    const response = await $fetch<{ question: Question }>(`/api/questions/${id}`, {
      method: 'PUT',
      body: payload
    })

    return response.question
  }

  async function deleteQuestion(id: number) {
    return $fetch(`/api/questions/${id}`, {
      method: 'DELETE'
    })
  }

  async function importJson(payload: QuizExport & { replaceExisting?: boolean }) {
    return $fetch<{ imported: number, total: number }>('/api/import/json', {
      method: 'POST',
      query: { examId },
      body: payload
    })
  }

  async function exportJson() {
    return $fetch<QuizExport>('/api/export/json', { query: { examId } })
  }

  async function listAttempts() {
    return (await $fetch<{ attempts: SavedAttempt[] }>('/api/attempts', { query: { examId } })).attempts
  }

  async function saveAttempt(payload: AttemptPayload) {
    return $fetch('/api/attempts', { method: 'POST', body: { ...payload, examId }, keepalive: true })
  }

  return {
    examId,
    listQuestions,
    listTags,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    exportJson,
    listAttempts,
    saveAttempt,
    importJson
  }
}
