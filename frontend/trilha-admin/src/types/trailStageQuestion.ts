import type { Timestamp } from 'firebase/firestore'

export type TrailStageQuestionOption = {
  key: string
  text: string
}

/**
 * Conteúdo sequencial de uma etapa dentro do stage.
 * Comportamento (`stage_type`, `prompt`) fica em `trail_stages`.
 */
export type TrailStageQuestion = {
  id: string
  trail_id: string
  stage_number: number
  question_number: number
  title: string
  content: string
  correct_option: string | null
  options: TrailStageQuestionOption[] | null
  explanation: string | null
  active: boolean
  created_at: Timestamp | null
  updated_at: Timestamp | null
}
