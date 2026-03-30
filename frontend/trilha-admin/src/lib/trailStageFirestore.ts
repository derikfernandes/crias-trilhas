import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { TrailStage } from '../types/trailStage'

export const TRAIL_STAGES_COLLECTION = 'trail_stages'

export function trailStageDocId(trailId: string, stageNumber: number): string {
  return `${trailId}_stage_${stageNumber}`
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
    title: typeof data.title === 'string' ? data.title : '',
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

