export interface AnswerInput {
  id?: number
  text: string
  isCorrect: boolean
}

export interface Tag {
  id: number
  name: string
}

export interface Question {
  id: number
  prompt: string
  explanation: string
  note: string
  answers: AnswerInput[]
  tags: Tag[]
  createdAt: string
  updatedAt: string
}

export interface QuestionPayload {
  prompt: string
  explanation: string
  note: string
  answers: AnswerInput[]
  tags: string[]
}

export interface QuestionFilters {
  tag?: string
  search?: string
}

export interface QuizExport {
  version: 1
  exportedAt: string
  questions: QuestionPayload[]
}

export interface ExamSubmission {
  questionId: number
  answerIds: number[]
}
