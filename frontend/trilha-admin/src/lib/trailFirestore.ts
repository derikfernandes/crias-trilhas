import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { Trail } from '../types/trail'

export const TRAILS_COLLECTION = 'trails'

function toIntLoose(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) {
    return v
  }
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10)
    if (Number.isFinite(n) && Number.isInteger(n)) return n
  }
  return null
}

export function snapshotToTrail(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): Trail {
  const data = d.data()
  const defaultSteps = 8

  if (!data) {
    return {
      id: d.id,
      institution_id: '',
      name: '',
      description: '',
      subject: '',
      default_total_steps_per_stage: defaultSteps,
      active: false,
      created_at: null,
      updated_at: null,
    }
  }

  const rawSteps = toIntLoose(data.default_total_steps_per_stage)
  const steps = rawSteps === null ? defaultSteps : rawSteps

  return {
    id: d.id,
    institution_id: typeof data.institution_id === 'string' ? data.institution_id : '',
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    subject: typeof data.subject === 'string' ? data.subject : '',
    default_total_steps_per_stage: steps,
    active: typeof data.active === 'boolean' ? data.active : false,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  }
}

export function formatTrailTs(value: Trail['created_at']): string {
  if (!value || typeof value.toDate !== 'function') return '—'
  try {
    return value.toDate().toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

