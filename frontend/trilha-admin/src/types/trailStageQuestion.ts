import type { Timestamp } from 'firebase/firestore'

/** Valores permitidos para `question_type` em `trail_stage_questions`. */
export type TrailStageQuestionType = 'ai' | 'fixed' | 'exercise'

export type TrailStageQuestionOption = {
  key: string
  text: string
}

/** Documento Firestore: questão/etapa dentro de um stage de trilha (sem prompt). */
export type TrailStageQuestion = {
  id: string
  trail_id: string
  stage_number: number
  question_number: number
  question_type: TrailStageQuestionType
  title: string
  content: string
  correct_option: string | null
  options: TrailStageQuestionOption[] | null
  explanation: string | null
  active: boolean
  created_at: Timestamp | null
  updated_at: Timestamp | null
}
