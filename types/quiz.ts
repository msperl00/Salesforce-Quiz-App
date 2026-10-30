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
  examId: number
  prompt: string
  imageDataUrl: string
  imageUrl?: string
  explanation: string
  note: string
  answers: AnswerInput[]
  tags: Tag[]
  createdAt: string
  updatedAt: string
}

export interface QuestionPayload {
  examId?: number
  prompt: string
  imageDataUrl?: string
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
  examName?: string
  exportedAt: string
  questions: QuestionPayload[]
}

export interface Exam {
  id: number
  name: string
  questionCount: number
}

export interface ExamSubmission {
  questionId: number
  answerIds: number[]
}

export type SessionMode = 'practice' | 'exam'

export interface SavedAttempt {
  id: string
  examId: number
  mode: SessionMode
  questionIds: number[]
  completedAt: string
}

export interface AttemptPayload {
  id: string
  examId: number
  mode: SessionMode
  questionIds: number[]
}
