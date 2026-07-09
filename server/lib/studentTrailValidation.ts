export const STUDENT_TRAIL_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'blocked',
] as const

export type StudentTrailStatus = (typeof STUDENT_TRAIL_STATUSES)[number]

export type StudentTrailCreatePayload = {
  student_id: string
  institution_id: string
  trail_id: string
  current_stage_number: number
  current_question_number: number
  status: StudentTrailStatus
}

export function sanitizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length ? s : null
}

export function parseIntLoose(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) {
    return v
  }
  if (typeof v !== 'string') return null
  const n = Number.parseInt(v.trim(), 10)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

export function parseStatus(v: unknown): StudentTrailStatus | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return (STUDENT_TRAIL_STATUSES as readonly string[]).includes(s)
    ? (s as StudentTrailStatus)
    : null
}

export function validateStudentTrailCreate(
  payload: unknown,
): { ok: true; data: StudentTrailCreatePayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload inválido' }
  }
  const body = payload as Record<string, unknown>

  const student_id = sanitizeString(body.student_id)
  const institution_id = sanitizeString(body.institution_id)
  const trail_id = sanitizeString(body.trail_id)

  if (!student_id) {
    return { ok: false, error: 'Campo "student_id" é obrigatório' }
  }
  if (!institution_id) {
    return { ok: false, error: 'Campo "institution_id" é obrigatório' }
  }
  if (!trail_id) {
    return { ok: false, error: 'Campo "trail_id" é obrigatório' }
  }

  const statusRaw =
    body.status === undefined || body.status === null
      ? 'not_started'
      : parseStatus(body.status)

  if (!statusRaw) {
    return {
      ok: false,
      error: `Campo "status" inválido. Use um de: ${STUDENT_TRAIL_STATUSES.join(', ')}`,
    }
  }

  const current_stage_number =
    body.current_stage_number === undefined || body.current_stage_number === null
      ? 1
      : parseIntLoose(body.current_stage_number)

  if (current_stage_number === null || current_stage_number < 1) {
    return {
      ok: false,
      error: 'Campo "current_stage_number" deve ser um inteiro >= 1',
    }
  }

  const current_question_number =
    body.current_question_number === undefined ||
    body.current_question_number === null
      ? 1
      : parseIntLoose(body.current_question_number)

  if (current_question_number === null || current_question_number < 1) {
    return {
      ok: false,
      error: 'Campo "current_question_number" deve ser um inteiro >= 1',
    }
  }

  return {
    ok: true,
    data: {
      student_id,
      institution_id,
      trail_id,
      current_stage_number,
      current_question_number,
      status: statusRaw,
    },
  }
}

