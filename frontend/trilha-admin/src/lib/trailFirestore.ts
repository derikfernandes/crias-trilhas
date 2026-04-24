import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { PhaseBlueprint, Trail } from '../types/trail'
import type { TrailStageType } from '../types/trailStage'

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

function parseStageTypeLoose(v: unknown): TrailStageType | null {
  return v === 'ai' || v === 'fixed' || v === 'exercise' ? v : null
}

function parsePhaseBlueprintLoose(raw: unknown): PhaseBlueprint | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title : ''
  const stage_type = parseStageTypeLoose(o.stage_type)
  if (!stage_type) return null
  const promptRaw = o.prompt
  const prompt =
    promptRaw === null || promptRaw === undefined
      ? null
      : typeof promptRaw === 'string'
        ? promptRaw
        : null
  return { title, stage_type, prompt }
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

  let phase_blueprint: PhaseBlueprint[] | null = null
  const bpRaw = data.phase_blueprint
  if (Array.isArray(bpRaw)) {
    const parsed = bpRaw
      .map(parsePhaseBlueprintLoose)
      .filter((x): x is PhaseBlueprint => x !== null)
    if (parsed.length > 0) phase_blueprint = parsed
  }

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
    phase_blueprint,
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

