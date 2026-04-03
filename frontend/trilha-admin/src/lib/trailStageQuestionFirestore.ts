import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'

import type {
  TrailStageQuestion,
  TrailStageQuestionOption,
} from '../types/trailStageQuestion'

export const TRAIL_STAGE_QUESTIONS_COLLECTION = 'trail_stage_questions'

function readOptions(raw: unknown): TrailStageQuestionOption[] | null {
  if (!Array.isArray(raw)) return null
  const out: TrailStageQuestionOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.key !== 'string' || typeof o.text !== 'string') continue
    out.push({ key: o.key, text: o.text })
  }
  return out.length ? out : null
}

export function trailStageQuestionDocId(
  trailId: string,
  stageNumber: number,
  questionNumber: number,
): string {
  return `${trailId}_stage_${stageNumber}_q_${questionNumber}`
}

export function snapshotToTrailStageQuestion(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): TrailStageQuestion {
  const data = d.data()
  if (!data) {
    return {
      id: d.id,
      trail_id: '',
      stage_number: 1,
      question_number: 1,
      title: '',
      content: '',
      correct_option: null,
      options: null,
      explanation: null,
      is_released: false,
      active: false,
      created_at: null,
      updated_at: null,
    }
  }

  return {
    id: d.id,
    trail_id: typeof data.trail_id === 'string' ? data.trail_id : '',
    stage_number:
      typeof data.stage_number === 'number' && Number.isFinite(data.stage_number)
        ? data.stage_number
        : 1,
    question_number:
      typeof data.question_number === 'number' &&
      Number.isFinite(data.question_number)
        ? data.question_number
        : 1,
    title: typeof data.title === 'string' ? data.title : '',
    content: typeof data.content === 'string' ? data.content : '',
    correct_option:
      typeof data.correct_option === 'string' ? data.correct_option : null,
    options: readOptions(data.options),
    explanation:
      typeof data.explanation === 'string'
        ? data.explanation
        : data.explanation === null
          ? null
          : null,
    is_released:
      typeof data.is_released === 'boolean'
        ? data.is_released
        : typeof data.question_number === 'number' &&
            Number.isFinite(data.question_number) &&
            data.question_number === 1,
    active: typeof data.active === 'boolean' ? data.active : false,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  }
}

export function formatTrailStageQuestionTs(
  value: TrailStageQuestion['created_at'],
): string {
  if (!value || typeof value.toDate !== 'function') return '—'
  try {
    return value.toDate().toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}
