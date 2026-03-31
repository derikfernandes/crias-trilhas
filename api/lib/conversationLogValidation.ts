export const CONVERSATION_LOG_SENDERS = ['system', 'student'] as const

export type ConversationLogSender = (typeof CONVERSATION_LOG_SENDERS)[number]

export const CONVERSATION_LOG_MESSAGE_TYPES = [
  'text',
  'instruction',
  'exercise',
  'feedback',
] as const

export type ConversationLogMessageType =
  (typeof CONVERSATION_LOG_MESSAGE_TYPES)[number]

export type ConversationLogCreatePayload = {
  student_id: string
  trail_id: string
  stage_number: number
  question_number: number
  sender: ConversationLogSender
  message_text: string
  institution_id: string | null
  message_type: ConversationLogMessageType | null
  metadata: Record<string, unknown> | null
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

export function parseSender(v: unknown): ConversationLogSender | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return (CONVERSATION_LOG_SENDERS as readonly string[]).includes(s)
    ? (s as ConversationLogSender)
    : null
}

export function parseMessageType(
  v: unknown,
): ConversationLogMessageType | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return (CONVERSATION_LOG_MESSAGE_TYPES as readonly string[]).includes(s)
    ? (s as ConversationLogMessageType)
    : null
}

function parseMetadata(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null) return null
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

export function validateConversationLogCreate(
  payload: unknown,
):
  | { ok: true; data: ConversationLogCreatePayload }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload inválido' }
  }
  const body = payload as Record<string, unknown>

  const student_id = sanitizeString(body.student_id)
  const trail_id = sanitizeString(body.trail_id)

  if (!student_id) {
    return { ok: false, error: 'Campo "student_id" é obrigatório' }
  }
  if (!trail_id) {
    return { ok: false, error: 'Campo "trail_id" é obrigatório' }
  }

  const stage_number =
    body.stage_number === undefined || body.stage_number === null
      ? null
      : parseIntLoose(body.stage_number)

  if (stage_number === null || stage_number < 1) {
    return {
      ok: false,
      error: 'Campo "stage_number" é obrigatório e deve ser um inteiro >= 1',
    }
  }

  const question_number =
    body.question_number === undefined || body.question_number === null
      ? null
      : parseIntLoose(body.question_number)

  if (question_number === null || question_number < 1) {
    return {
      ok: false,
      error:
        'Campo "question_number" é obrigatório e deve ser um inteiro >= 1',
    }
  }

  const sender = parseSender(body.sender)
  if (!sender) {
    return {
      ok: false,
      error:
        'Campo "sender" é obrigatório. Use "system" ou "student".',
    }
  }

  const message_text = sanitizeString(body.message_text)
  if (!message_text) {
    return {
      ok: false,
      error: 'Campo "message_text" é obrigatório',
    }
  }

  const institution_id = body.institution_id
    ? sanitizeString(body.institution_id)
    : null

  const message_type = parseMessageType(body.message_type)
  const metadata = parseMetadata(body.metadata)

  return {
    ok: true,
    data: {
      student_id,
      trail_id,
      stage_number,
      question_number,
      sender,
      message_text,
      institution_id,
      message_type,
      metadata,
    },
  }
}

