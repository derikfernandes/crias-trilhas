import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import {
  createTrailStageQuestion,
  deactivateTrailStageQuestion,
  getTrailStageQuestionByComposite,
  getTrailStageQuestionById,
  listTrailStageQuestionsForStage,
  updateTrailStageQuestionFields,
} from './lib/trailStageQuestionService'
import {
  isQuestionType,
  parseTrailStageQuestionUpdatePayload,
  parseBoolean,
  parseIntLoose,
  validateTrailStageQuestionCreate,
  type TrailStageQuestionType,
} from './lib/trailStageQuestionValidation'

type Json = Record<string, unknown>

function jsonResponse(
  body: Json | Json[] | string,
  init?: ResponseInit,
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function serializeTs(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'object' && value && 'toDate' in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate()
      return d.toISOString()
    } catch {
      return null
    }
  }
  return null
}

let cachedDb: ReturnType<typeof getFirestore> | null = null

function getDb() {
  if (cachedDb) return cachedDb

  const saJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ausente. Defina no ambiente da Vercel.',
    )
  }

  const serviceAccount = JSON.parse(saJson) as {
    project_id?: string
    client_email?: string
    private_key?: string
    [k: string]: unknown
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    })
  }

  cachedDb = getFirestore()
  return cachedDb
}

function parseOptionsFromDoc(
  v: unknown,
): { key: string; text: string }[] | null {
  if (!Array.isArray(v)) return null
  const out: { key: string; text: string }[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    if (typeof o.key !== 'string' || typeof o.text !== 'string') return null
    out.push({ key: o.key, text: o.text })
  }
  return out.length ? out : null
}

function readQuestionType(data: Record<string, unknown>): TrailStageQuestionType {
  const t = typeof data.question_type === 'string' ? data.question_type : ''
  if (isQuestionType(t)) return t
  return 'ai'
}

function toTrailStageQuestionOutput(
  data: Record<string, unknown>,
  id: string,
  opts?: { simple?: boolean },
): Json {
  const trail_id = typeof data.trail_id === 'string' ? data.trail_id : ''
  const stage_number =
    typeof data.stage_number === 'number' && Number.isFinite(data.stage_number)
      ? data.stage_number
      : 0
  const question_number =
    typeof data.question_number === 'number' && Number.isFinite(data.question_number)
      ? data.question_number
      : 0
  const question_type = readQuestionType(data)
  const title = typeof data.title === 'string' ? data.title : ''
  const content = typeof data.content === 'string' ? data.content : ''
  const active = typeof data.active === 'boolean' ? data.active : false

  let correct_option: string | null = null
  if (data.correct_option !== undefined && data.correct_option !== null) {
    correct_option =
      typeof data.correct_option === 'string' ? data.correct_option : null
  }

  const options = parseOptionsFromDoc(data.options)

  let explanation: string | null = null
  if (typeof data.explanation === 'string') explanation = data.explanation
  else if (data.explanation === null) explanation = null

  if (opts?.simple) {
    return {
      id,
      trail_id,
      stage_number,
      question_number,
      question_type,
      title,
      content,
      correct_option,
      options,
      explanation,
      active,
    }
  }

  return {
    id,
    trail_id,
    stage_number,
    question_number,
    question_type,
    title,
    content,
    correct_option,
    options,
    explanation,
    active,
    created_at: serializeTs(data.created_at),
    updated_at: serializeTs(data.updated_at),
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim()

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  let db: ReturnType<typeof getFirestore>
  try {
    db = getDb()
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'Erro ao inicializar Firebase Admin.'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
      },
    })
  }

  const collection =
    process.env.TRAIL_STAGE_QUESTIONS_COLLECTION ?? 'trail_stage_questions'

  const respond = (status: number, body: Json): Response => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
      },
    })
  }

  const qTrailId = url.searchParams.get('trail_id')?.trim() || null
  const qStageNumber = parseIntLoose(url.searchParams.get('stage_number'))
  const qQuestionNumber = parseIntLoose(url.searchParams.get('question_number'))
  const qActive = parseBoolean(url.searchParams.get('active') ?? '') ?? null
  const simple = url.searchParams.get('simple') === '1'
  const deactivateOnly = url.searchParams.get('deactivate') === '1'

  try {
    if (request.method === 'GET') {
      if (id) {
        const snap = await getTrailStageQuestionById(db, collection, id)
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        return jsonResponse(toTrailStageQuestionOutput(data, snap.id, { simple }), {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (qTrailId && qStageNumber !== null && qQuestionNumber !== null) {
        const snap = await getTrailStageQuestionByComposite(
          db,
          collection,
          qTrailId,
          qStageNumber,
          qQuestionNumber,
        )
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        return jsonResponse(toTrailStageQuestionOutput(data, snap.id, { simple }), {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (qTrailId && qStageNumber !== null) {
        const snap = await listTrailStageQuestionsForStage(db, collection, qTrailId, qStageNumber)
        const items = snap.docs
          .map((d) =>
            toTrailStageQuestionOutput((d.data() ?? {}) as Record<string, unknown>, d.id, {
              simple,
            }),
          )
          .filter((item) => {
            if (qActive === null) return true
            return typeof item.active === 'boolean' ? item.active === qActive : false
          })
        return jsonResponse(items as Json[], { status: 200, headers: corsHeaders() })
      }

      return respond(400, {
        error:
          'Informe id, ou (trail_id + stage_number + question_number), ou (trail_id + stage_number) para listar.',
      })
    }

    if (request.method === 'POST') {
      if (id) return respond(400, { error: 'id não deve ser enviado em POST' })

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return respond(400, { error: 'JSON inválido' })
      }

      const validated = validateTrailStageQuestionCreate(payload)
      if (!validated.ok) return respond(400, { error: validated.error })

      try {
        const { id: newId } = await createTrailStageQuestion(db, collection, validated.data)
        return jsonResponse(
          {
            ...toTrailStageQuestionOutput(
              {
                ...validated.data,
                active: true,
                created_at: null,
                updated_at: null,
              } as Record<string, unknown>,
              newId,
            ),
            created_at: null,
            updated_at: null,
          },
          { status: 201, headers: corsHeaders() },
        )
      } catch (e) {
        return respond(409, {
          error: e instanceof Error ? e.message : 'Conflito ao criar questão',
        })
      }
    }

    if (request.method === 'PUT') {
      if (!id) return respond(400, { error: 'id é obrigatório em PUT' })

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return respond(400, { error: 'JSON inválido' })
      }

      const ref = db.collection(collection).doc(id)
      const snap = await ref.get()
      if (!snap.exists) return respond(404, { error: 'Not found' })

      const existing = (snap.data() ?? {}) as Record<string, unknown>
      const existingTrailId =
        typeof existing.trail_id === 'string' ? existing.trail_id : ''
      const existingStageNumber =
        typeof existing.stage_number === 'number' ? existing.stage_number : 0
      const existingQuestionNumber =
        typeof existing.question_number === 'number' ? existing.question_number : 0

      if (deactivateOnly) {
        const body = payload as Json
        if (Object.keys(body).length > 0) {
          return respond(400, {
            error:
              'Com ?deactivate=1 envie corpo vazio {} — use PUT normal para outras alterações.',
          })
        }
        await deactivateTrailStageQuestion(db, collection, id)
        return jsonResponse({ ok: true, id, active: false }, { status: 200, headers: corsHeaders() })
      }

      const parsed = parseTrailStageQuestionUpdatePayload(payload)
      if (!parsed.ok) return respond(400, { error: parsed.error })

      const updates = parsed.data

      if ('trail_id' in (payload as Json) || 'stage_number' in (payload as Json) || 'question_number' in (payload as Json)) {
        return respond(400, {
          error: 'Campos trail_id, stage_number e question_number não podem ser alterados.',
        })
      }

      const mergedForValidate = {
        trail_id: existingTrailId,
        stage_number: existingStageNumber,
        question_number: existingQuestionNumber,
        question_type: updates.question_type ?? readQuestionType(existing),
        title: updates.title ?? (typeof existing.title === 'string' ? existing.title : ''),
        content: updates.content ?? (typeof existing.content === 'string' ? existing.content : ''),
        explanation: Object.prototype.hasOwnProperty.call(updates, 'explanation')
          ? updates.explanation
          : typeof existing.explanation === 'string' || existing.explanation === null
            ? existing.explanation
            : null,
        correct_option: Object.prototype.hasOwnProperty.call(updates, 'correct_option')
          ? updates.correct_option
          : existing.correct_option !== undefined
            ? existing.correct_option
            : null,
        options: Object.prototype.hasOwnProperty.call(updates, 'options')
          ? updates.options
          : parseOptionsFromDoc(existing.options),
      }

      const validated = validateTrailStageQuestionCreate(mergedForValidate)
      if (!validated.ok) return respond(400, { error: validated.error })

      const patch: Record<string, unknown> = {}
      if (updates.question_type !== undefined) {
        patch.question_type = validated.data.question_type
      }
      if (updates.title !== undefined) patch.title = validated.data.title
      if (updates.content !== undefined) patch.content = validated.data.content
      if (Object.prototype.hasOwnProperty.call(updates, 'explanation')) {
        patch.explanation = validated.data.explanation
      }
      if (
        Object.prototype.hasOwnProperty.call(updates, 'correct_option') ||
        Object.prototype.hasOwnProperty.call(updates, 'options') ||
        updates.question_type !== undefined
      ) {
        patch.correct_option = validated.data.correct_option
        patch.options = validated.data.options
      }
      if (updates.active !== undefined) patch.active = updates.active

      if (Object.keys(patch).length === 0) {
        return respond(400, { error: 'Nenhum campo aplicável após validação' })
      }

      await updateTrailStageQuestionFields(db, collection, id, patch)
      return jsonResponse({ ok: true, id }, { status: 200, headers: corsHeaders() })
    }

    if (request.method === 'DELETE') {
      return respond(405, {
        error: 'Exclusão não suportada. Use PUT com { "active": false } ou ?deactivate=1 e corpo vazio.',
      })
    }

    return respond(405, { error: `Método ${request.method} não permitido` })
  } catch (e) {
    return respond(500, { error: e instanceof Error ? e.message : 'Erro interno' })
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  const method = (req?.method ?? 'GET') as string
  const host = (req?.headers?.host ?? 'localhost') as string
  const path = (req?.url ?? '/') as string
  const url = new URL(path, `https://${host}`)

  const headers = new Headers()
  const rawHeaders = (req?.headers ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(','))
  }

  const init: RequestInit = { method, headers }

  if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
    const body = req?.body
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json; charset=utf-8')
      }
    }
  }

  const response = await handleRequest(new Request(url.toString(), init))

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    try {
      res.setHeader(key, value)
    } catch {
      // ignora headers inválidos no ambiente serverless
    }
  })

  const ab = await response.arrayBuffer()
  res.end(Buffer.from(ab))
}
