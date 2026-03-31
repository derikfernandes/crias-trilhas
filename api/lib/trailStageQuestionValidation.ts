/**
 * Validação e tipos para documentos da collection `trail_stage_questions`.
 * Regras alinhadas ao modelo pedagógico (sem campo de prompt).
 */

export const TRAIL_STAGE_QUESTION_TYPES = ['ai', 'fixed', 'exercise'] as const

export type TrailStageQuestionType = (typeof TRAIL_STAGE_QUESTION_TYPES)[number]

export type TrailStageQuestionOption = { key: string; text: string }

export type TrailStageQuestionCreatePayload = {
  trail_id: string
  stage_number: number
  question_number: number
  question_type: TrailStageQuestionType
  title: string
  content: string
  correct_option: string | null
  options: TrailStageQuestionOption[] | null
  explanation: string | null
}

export function isQuestionType(v: string): v is TrailStageQuestionType {
  return (TRAIL_STAGE_QUESTION_TYPES as readonly string[]).includes(v)
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

export function parseBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (['1', 'true', 'yes', 'sim'].includes(s)) return true
  if (['0', 'false', 'no', 'não', 'nao'].includes(s)) return false
  return null
}

function parseOptions(v: unknown): TrailStageQuestionOption[] | null | 'invalid' {
  if (v === undefined || v === null) return null
  if (!Array.isArray(v)) return 'invalid'
  const out: TrailStageQuestionOption[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') return 'invalid'
    const o = item as Record<string, unknown>
    const key = sanitizeString(o.key)
    const text = sanitizeString(o.text)
    if (!key || !text) return 'invalid'
    out.push({ key, text })
  }
  return out
}

export function normalizeExerciseFields(
  correctRaw: unknown,
  optionsRaw: unknown,
): { error?: string; correct_option: string | null; options: TrailStageQuestionOption[] | null } {
  const correct_option =
    correctRaw === undefined || correctRaw === null
      ? null
      : sanitizeString(correctRaw)

  if (!correct_option) {
    return {
      error: 'Campo "correct_option" é obrigatório para question_type "exercise"',
      correct_option: null,
      options: null,
    }
  }

  const parsed = parseOptions(optionsRaw)
  if (parsed === 'invalid') {
    return {
      error: 'Campo "options" deve ser um array de { key, text } ou null',
      correct_option: null,
      options: null,
    }
  }

  let options: TrailStageQuestionOption[] | null = parsed
  if (options && options.length === 0) {
    options = null
  }

  if (options && options.length > 0) {
    const keys = new Set(options.map((o) => o.key))
    if (keys.size !== options.length) {
      return {
        error: 'Chaves em "options" devem ser únicas',
        correct_option: null,
        options: null,
      }
    }
    if (!keys.has(correct_option)) {
      return {
        error: `Campo "correct_option" deve corresponder a uma das chaves em "options" (recebido: "${correct_option}")`,
        correct_option: null,
        options: null,
      }
    }
  }

  return { correct_option, options }
}

function normalizeNonExerciseFields(
  correctRaw: unknown,
  optionsRaw: unknown,
): { error?: string; correct_option: null; options: null } {
  if (correctRaw !== undefined && correctRaw !== null && sanitizeString(correctRaw) !== null) {
    return {
      error: 'Campo "correct_option" deve ser null quando question_type não é "exercise"',
      correct_option: null,
      options: null,
    }
  }
  const parsed = parseOptions(optionsRaw)
  if (parsed === 'invalid') {
    return {
      error: 'Campo "options" inválido para tipo não-exercício',
      correct_option: null,
      options: null,
    }
  }
  if (parsed && parsed.length > 0) {
    return {
      error: 'Campo "options" deve ser null ou vazio quando question_type não é "exercise"',
      correct_option: null,
      options: null,
    }
  }
  return { correct_option: null, options: null }
}

/**
 * Valida payload de criação (POST). `active` não entra aqui — inicia sempre true no serviço.
 */
export function validateTrailStageQuestionCreate(
  payload: unknown,
): { ok: true; data: TrailStageQuestionCreatePayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload inválido' }
  }
  const body = payload as Record<string, unknown>

  const trail_id = sanitizeString(body.trail_id)
  const stage_number = parseIntLoose(body.stage_number)
  const question_number = parseIntLoose(body.question_number)
  const qTypeRaw = sanitizeString(body.question_type)
  const title = sanitizeString(body.title)
  const content = sanitizeString(body.content)

  if (!trail_id) return { ok: false, error: 'Campo "trail_id" é obrigatório' }
  if (stage_number === null) {
    return { ok: false, error: 'Campo "stage_number" deve ser um inteiro' }
  }
  if (stage_number < 1) {
    return { ok: false, error: 'Campo "stage_number" deve ser >= 1' }
  }
  if (question_number === null) {
    return { ok: false, error: 'Campo "question_number" deve ser um inteiro' }
  }
  if (question_number < 1) {
    return { ok: false, error: 'Campo "question_number" deve ser >= 1' }
  }
  if (!qTypeRaw || !isQuestionType(qTypeRaw)) {
    return {
      ok: false,
      error: `Campo "question_type" deve ser um de: ${TRAIL_STAGE_QUESTION_TYPES.join(', ')}`,
    }
  }
  if (!title) return { ok: false, error: 'Campo "title" é obrigatório' }
  if (!content) return { ok: false, error: 'Campo "content" é obrigatório' }

  let explanation: string | null = null
  if (body.explanation !== undefined) {
    if (body.explanation === null) {
      explanation = null
    } else {
      explanation = sanitizeString(body.explanation)
    }
  }

  if (qTypeRaw === 'exercise') {
    const ex = normalizeExerciseFields(body.correct_option, body.options)
    if (ex.error) return { ok: false, error: ex.error }
    return {
      ok: true,
      data: {
        trail_id,
        stage_number,
        question_number,
        question_type: qTypeRaw,
        title,
        content,
        correct_option: ex.correct_option,
        options: ex.options,
        explanation,
      },
    }
  }

  const nx = normalizeNonExerciseFields(body.correct_option, body.options)
  if (nx.error) return { ok: false, error: nx.error }
  return {
    ok: true,
    data: {
      trail_id,
      stage_number,
      question_number,
      question_type: qTypeRaw,
      title,
      content,
      correct_option: nx.correct_option,
      options: nx.options,
      explanation,
    },
  }
}

export type TrailStageQuestionUpdateFields = Partial<{
  question_type: TrailStageQuestionType
  title: string
  content: string
  correct_option: string | null
  options: TrailStageQuestionOption[] | null
  explanation: string | null
  active: boolean
}>

/**
 * Extrai atualizações parciais do body (sem cruzar exercise com documento existente — isso fica no handler).
 */
export function parseTrailStageQuestionUpdatePayload(payload: unknown):
  | { ok: true; data: TrailStageQuestionUpdateFields }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload inválido' }
  }
  const body = payload as Record<string, unknown>
  const updates: TrailStageQuestionUpdateFields = {}

  if ('question_type' in body && body.question_type !== undefined) {
    const s = sanitizeString(body.question_type)
    if (!s || !isQuestionType(s)) {
      return {
        ok: false,
        error: `Campo "question_type" deve ser um de: ${TRAIL_STAGE_QUESTION_TYPES.join(', ')}`,
      }
    }
    updates.question_type = s
  }

  if ('title' in body && body.title !== undefined) {
    const title = sanitizeString(body.title)
    if (!title) return { ok: false, error: 'Campo "title" deve ser uma string não vazia' }
    updates.title = title
  }

  if ('content' in body && body.content !== undefined) {
    const content = sanitizeString(body.content)
    if (!content) return { ok: false, error: 'Campo "content" deve ser uma string não vazia' }
    updates.content = content
  }

  if ('explanation' in body) {
    if (body.explanation === undefined) {
      // ignora
    } else if (body.explanation === null) {
      updates.explanation = null
    } else {
      updates.explanation = sanitizeString(body.explanation)
    }
  }

  if ('active' in body && body.active !== undefined) {
    const active = parseBoolean(body.active)
    if (active === null) return { ok: false, error: 'Campo "active" deve ser boolean' }
    updates.active = active
  }

  if ('correct_option' in body) {
    if (body.correct_option === undefined) {
      // ignora
    } else if (body.correct_option === null) {
      updates.correct_option = null
    } else {
      const c = sanitizeString(body.correct_option)
      updates.correct_option = c
    }
  }

  if ('options' in body) {
    if (body.options === undefined) {
      // ignora
    } else if (body.options === null) {
      updates.options = null
    } else {
      const parsed = parseOptions(body.options)
      if (parsed === 'invalid') {
        return { ok: false, error: 'Campo "options" deve ser um array de { key, text } ou null' }
      }
      updates.options = parsed && parsed.length > 0 ? parsed : null
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nenhum campo válido para atualizar' }
  }

  return { ok: true, data: updates }
}
