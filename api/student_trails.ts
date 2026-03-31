import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import {
  createStudentTrail,
  getStudentTrailByComposite,
  getStudentTrailById,
  getStudentTrailPosition,
  advanceStudentTrailQuestion,
  advanceStudentTrailStage,
  markStudentTrailLastInteraction,
  completeStudentTrail,
  blockStudentTrail,
} from './lib/studentTrailService'
import {
  validateStudentTrailCreate,
  parseStatus,
  parseIntLoose,
  type StudentTrailStatus,
} from './lib/studentTrailValidation'

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

  const serviceAccount = JSON.parse(saJson) as ServiceAccount

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    })
  }

  cachedDb = getFirestore()
  return cachedDb
}

function sanitizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length ? s : null
}

function toStudentTrailOutput(
  data: Record<string, unknown>,
  id: string,
): Json {
  const student_id =
    typeof data.student_id === 'string' ? data.student_id : ''
  const institution_id =
    typeof data.institution_id === 'string' ? data.institution_id : ''
  const trail_id =
    typeof data.trail_id === 'string' ? data.trail_id : ''

  const current_stage_number =
    typeof data.current_stage_number === 'number' &&
    Number.isFinite(data.current_stage_number)
      ? data.current_stage_number
      : 1
  const current_question_number =
    typeof data.current_question_number === 'number' &&
    Number.isFinite(data.current_question_number)
      ? data.current_question_number
      : 1

  const statusRaw =
    typeof data.status === 'string' ? data.status : 'not_started'
  const status: StudentTrailStatus =
    statusRaw === 'in_progress' ||
    statusRaw === 'completed' ||
    statusRaw === 'blocked'
      ? (statusRaw as StudentTrailStatus)
      : 'not_started'

  return {
    id,
    student_id,
    institution_id,
    trail_id,
    current_stage_number,
    current_question_number,
    status,
    started_at: serializeTs(data.started_at),
    completed_at: serializeTs(data.completed_at),
    last_interaction_at: serializeTs(data.last_interaction_at),
    created_at: serializeTs(data.created_at),
    updated_at: serializeTs(data.updated_at),
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim()
  const action = url.searchParams.get('action')?.trim() || null

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
    process.env.STUDENT_TRAILS_COLLECTION ?? 'student_trails'

  const respond = (status: number, body: Json): Response => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
      },
    })
  }

  const qStudentId = url.searchParams.get('student_id')?.trim() || null
  const qTrailId = url.searchParams.get('trail_id')?.trim() || null

  try {
    // GET /student_trails/
    // GET /student_trails?id=...
    // GET /student_trails?student_id=...&trail_id=...
    if (request.method === 'GET') {
      if (id) {
        const snap = await getStudentTrailById(db, collection, id)
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        return jsonResponse(toStudentTrailOutput(data, snap.id), {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (qStudentId && qTrailId) {
        const snap = await getStudentTrailByComposite(
          db,
          collection,
          qStudentId,
          qTrailId,
        )
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>

        // Função runtime principal: posição atual do aluno na trilha.
        const pos = await getStudentTrailPosition(
          db,
          collection,
          qStudentId,
          qTrailId,
        )
        if (!pos) return respond(404, { error: 'Not found' })

        return jsonResponse(
          {
            ...pos,
            started_at: serializeTs(data.started_at),
            completed_at: serializeTs(data.completed_at),
            last_interaction_at: serializeTs(data.last_interaction_at),
          },
          { status: 200, headers: corsHeaders() },
        )
      }

      return respond(400, {
        error:
          'Informe id, ou (student_id + trail_id) para buscar o progresso.',
      })
    }

    // POST /student_trails/
    if (request.method === 'POST') {
      if (id) {
        return respond(400, { error: 'id não deve ser enviado em POST' })
      }

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return respond(400, { error: 'JSON inválido' })
      }

      const validated = validateStudentTrailCreate(payload)
      if (validated.ok === false) return respond(400, { error: validated.error })

      try {
        const { id: newId } = await createStudentTrail(
          db,
          collection,
          validated.data,
        )
        return jsonResponse(
          {
            id: newId,
            student_id: validated.data.student_id,
            institution_id: validated.data.institution_id,
            trail_id: validated.data.trail_id,
            current_stage_number: validated.data.current_stage_number,
            current_question_number: validated.data.current_question_number,
            status: validated.data.status,
            started_at: null,
            completed_at: null,
            last_interaction_at: null,
            created_at: null,
            updated_at: null,
          },
          { status: 201, headers: corsHeaders() },
        )
      } catch (e) {
        return respond(409, {
          error:
            e instanceof Error
              ? e.message
              : 'Conflito ao criar progresso da trilha',
        })
      }
    }

    // PUT /student_trails
    // Operações de runtime controladas por ?action=...
    if (request.method === 'PUT') {
      if (!action) {
        return respond(400, {
          error:
            'Parâmetro "action" é obrigatório em PUT (ex: advance_question, advance_stage, mark_last_interaction, complete, block, update_status, update_position).',
        })
      }

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        payload = {}
      }
      const body = (payload ?? {}) as Record<string, unknown>

      const targetStudentId =
        qStudentId ?? sanitizeString(body.student_id) ?? null
      const targetTrailId =
        qTrailId ?? sanitizeString(body.trail_id) ?? null

      if (!targetStudentId || !targetTrailId) {
        return respond(400, {
          error:
            'Campos "student_id" e "trail_id" são obrigatórios (query ou body) para operações de runtime.',
        })
      }

      if (action === 'advance_question') {
        const pos = await advanceStudentTrailQuestion(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        return jsonResponse(pos as Json, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'advance_stage') {
        const pos = await advanceStudentTrailStage(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        return jsonResponse(pos as Json, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'mark_last_interaction') {
        await markStudentTrailLastInteraction(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'complete') {
        await completeStudentTrail(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        return jsonResponse({ ok: true, status: 'completed' }, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'block') {
        await blockStudentTrail(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        return jsonResponse({ ok: true, status: 'blocked' }, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'update_status') {
        const status = parseStatus(body.status)
        if (!status) {
          return respond(400, {
            error:
              'Campo "status" inválido. Use not_started, in_progress, completed ou blocked.',
          })
        }

        const { updateStudentTrailStatus } = await import(
          './lib/studentTrailService.js'
        )
        await updateStudentTrailStatus(
          db,
          collection,
          targetStudentId,
          targetTrailId,
          status,
        )
        return jsonResponse({ ok: true, status }, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      if (action === 'update_position') {
        const stage = body.current_stage_number
        const question = body.current_question_number

        const parsedStage =
          stage === undefined || stage === null
            ? null
            : parseIntLoose(stage)
        const parsedQuestion =
          question === undefined || question === null
            ? null
            : parseIntLoose(question)

        if (parsedStage !== null && parsedStage < 1) {
          return respond(400, {
            error:
              'Campo "current_stage_number" deve ser um inteiro >= 1 quando enviado.',
          })
        }
        if (parsedQuestion !== null && parsedQuestion < 1) {
          return respond(400, {
            error:
              'Campo "current_question_number" deve ser um inteiro >= 1 quando enviado.',
          })
        }

        const snap = await getStudentTrailByComposite(
          db,
          collection,
          targetStudentId,
          targetTrailId,
        )
        if (!snap.exists) return respond(404, { error: 'Not found' })

        const patch: Record<string, unknown> = {}
        if (parsedStage !== null) patch.current_stage_number = parsedStage
        if (parsedQuestion !== null)
          patch.current_question_number = parsedQuestion

        if (Object.keys(patch).length === 0) {
          return respond(400, {
            error:
              'Envie ao menos um de: current_stage_number, current_question_number.',
          })
        }

        const { updateStudentTrailFields } = await import(
          './lib/studentTrailService.js'
        )
        await updateStudentTrailFields(db, collection, snap.id, patch)

        return jsonResponse({ ok: true }, {
          status: 200,
          headers: corsHeaders(),
        })
      }

      return respond(400, {
        error:
          'Valor de "action" inválido. Use: advance_question, advance_stage, mark_last_interaction, complete, block, update_status, update_position.',
      })
    }

    if (request.method === 'DELETE') {
      return respond(405, {
        error:
          'Exclusão de student_trails não é suportada. Use operações de status/posição.',
      })
    }

    return respond(405, { error: `Método ${request.method} não permitido` })
  } catch (e) {
    return respond(500, {
      error: e instanceof Error ? e.message : 'Erro interno',
    })
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

