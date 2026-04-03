import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { TrailStage, TrailStageType } from '../types/trailStage'

export const TRAIL_STAGES_COLLECTION = 'trail_stages'

export function trailStageDocId(trailId: string, stageNumber: number): string {
  return `${trailId}_stage_${stageNumber}`
}

function parseStageTypeFromDoc(v: unknown): TrailStageType {
  if (v === 'ai' || v === 'fixed' || v === 'exercise') return v
  return 'fixed'
}

function parsePromptFromDoc(
  stageType: TrailStageType,
  v: unknown,
): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s.length) return null
  return stageType === 'ai' ? s : null
}

export function snapshotToTrailStage(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): TrailStage {
  const data = d.data()
  if (!data) {
    return {
      id: d.id,
      trail_id: '',
      stage_number: 1,
      title: '',
      stage_type: 'fixed',
      prompt: null,
      is_released: false,
      active: false,
      created_at: null,
      updated_at: null,
    }
  }

  const stage_type = parseStageTypeFromDoc(data.stage_type)

  return {
    id: d.id,
    trail_id: typeof data.trail_id === 'string' ? data.trail_id : '',
    stage_number:
      typeof data.stage_number === 'number' && Number.isFinite(data.stage_number)
        ? data.stage_number
        : 1,
    title: typeof data.title === 'string' ? data.title : '',
    stage_type,
    prompt: parsePromptFromDoc(stage_type, data.prompt),
    is_released: typeof data.is_released === 'boolean' ? data.is_released : false,
    active: typeof data.active === 'boolean' ? data.active : false,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  }
}

export function formatTrailStageTs(value: TrailStage['created_at']): string {
  if (!value || typeof value.toDate !== 'function') return '—'
  try {
    return value.toDate().toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

