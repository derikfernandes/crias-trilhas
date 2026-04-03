import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

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
      // firebase-admin Timestamp
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

function parseBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (['1', 'true', 'yes', 'sim'].includes(s)) return true
  if (['0', 'false', 'no', 'nao', 'não'].includes(s)) return false
  return null
}

function parseIntLoose(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) {
    return v
  }
  if (typeof v !== 'string') return null
  const n = Number.parseInt(v.trim(), 10)
  if (!Number.isFinite(n)) return null
  if (!Number.isInteger(n)) return null
  return n
}

type StageType = 'ai' | 'fixed' | 'exercise'

function parseStageType(v: unknown): StageType | null {
  const s = sanitizeString(v)
  if (!s) return null
  if (s === 'ai' || s === 'fixed' || s === 'exercise') return s
  return null
}

function existingStageType(data: Record<string, unknown>): StageType {
  return parseStageType(data.stage_type) ?? 'fixed'
}

function existingPrompt(data: Record<string, unknown>): string | null {
  const p = data.prompt
  if (p === null || p === undefined) return null
  if (typeof p !== 'string') return null
  const s = p.trim()
  return s.length ? s : null
}

/** Interpreta `prompt` no body: null explícito, string, ou ausência (para merge no PUT). */
function parsePromptValue(
  v: unknown,
): 'omit' | { kind: 'null' } | { kind: 'string'; value: string } | { kind: 'error' } {
  if (v === undefined) return 'omit'
  if (v === null) return { kind: 'null' }
  if (typeof v !== 'string') return { kind: 'error' }
  const s = v.trim()
  if (!s.length) return { kind: 'null' }
  return { kind: 'string', value: s }
}

function validateStageTypeAndPrompt(
  stage_type: StageType,
  prompt: string | null,
): { ok: true } | { ok: false; error: string } {
  if (stage_type === 'ai') {
    if (!prompt || !prompt.length) {
      return {
        ok: false,
        error:
          'Campo "prompt" é obrigatório (string não vazia) quando stage_type é "ai"',
      }
    }
    return { ok: true }
  }
  if (prompt !== null) {
    return {
      ok: false,
      error:
        'Campo "prompt" deve ser null quando stage_type é "fixed" ou "exercise"',
    }
  }
  return { ok: true }
}

function stageDocId(trail_id: string, stage_number: number): string {
  // Tornar determinístico simplifica a regra de unicidade:
  // `stage_number` é único dentro de cada `trail_id`.
  return `${trail_id}_stage_${stage_number}`
}

function toTrailStageOutput(
  data: Record<string, unknown>,
  id: string,
  opts?: { simple?: boolean },
): Json {
  const trail_id = typeof data.trail_id === 'string' ? data.trail_id : ''
  const stage_number =
    typeof data.stage_number === 'number' && Number.isFinite(data.stage_number)
      ? data.stage_number
      : 0
  const title = typeof data.title === 'string' ? data.title : ''
  const stage_type = existingStageType(data)
  const promptRaw = data.prompt
  const prompt =
    promptRaw === null || promptRaw === undefined
      ? null
      : typeof promptRaw === 'string'
        ? promptRaw.trim().length
          ? promptRaw.trim()
          : null
        : null
  const is_released = typeof data.is_released === 'boolean' ? data.is_released : false
  const active = typeof data.active === 'boolean' ? data.active : false

  if (opts?.simple) {
    return {
      id,
      trail_id,
      stage_number,
      title,
      stage_type,
      prompt: stage_type === 'ai' ? prompt : null,
      is_released,
      active,
    }
  }

  return {
    id,
    trail_id,
    stage_number,
    title,
    stage_type,
    prompt: stage_type === 'ai' ? prompt : null,
    is_released,
    active,
    created_at: serializeTs(data.created_at),
    updated_at: serializeTs(data.updated_at),
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim()
  const simple = url.searchParams.get('simple') === '1'

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

  const collection = process.env.TRAIL_STAGES_COLLECTION ?? 'trail_stages'

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
  const qStageNumberRaw = url.searchParams.get('stage_number')
  const qStageActive = parseBoolean(url.searchParams.get('active') ?? '') ?? null
  const qIsReleased = parseBoolean(url.searchParams.get('is_released') ?? '') ?? null

  try {
    if (request.method === 'GET') {
      if (id) {
        const snap = await db.collection(collection).doc(id).get()
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        return jsonResponse(toTrailStageOutput(data, snap.id, { simple }), {
          status: 200,
          headers: corsHeaders(),
        })
      }

      // Busca única por trail_id + stage_number (mesmo JSON do GET por id)
      if (url.searchParams.has('stage_number')) {
        if (!qTrailId) {
          return respond(400, {
            error:
              'Campo "trail_id" é obrigatório quando "stage_number" é informado',
          })
        }
        const sn = parseIntLoose(qStageNumberRaw)
        if (sn === null || sn < 1) {
          return respond(400, {
            error: 'Campo "stage_number" deve ser um inteiro >= 1',
          })
        }
        const docId = stageDocId(qTrailId, sn)
        const snap = await db.collection(collection).doc(docId).get()
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        const docTrail =
          typeof data.trail_id === 'string' ? data.trail_id.trim() : ''
        const docStage =
          typeof data.stage_number === 'number' && Number.isFinite(data.stage_number)
            ? data.stage_number
            : null
        if (docTrail !== qTrailId || docStage !== sn) {
          return respond(404, { error: 'Not found' })
        }
        return jsonResponse(toTrailStageOutput(data, snap.id, { simple }), {
          status: 200,
          headers: corsHeaders(),
        })
      }

      // Lista:
      // - se vier `trail_id`, devolve os stages dessa trilha
      // - se não vier, devolve tudo (ordenado por updated_at desc)
      let snap
      if (qTrailId) {
        // Sem `orderBy` + `where` em outro campo para evitar índice composto; ordena no servidor.
        snap = await db
          .collection(collection)
          .where('trail_id', '==', qTrailId)
          .get()
      } else {
        snap = await db.collection(collection).orderBy('updated_at', 'desc').get()
      }

      let items = snap.docs
        .map((d) =>
          toTrailStageOutput((d.data() ?? {}) as Record<string, unknown>, d.id, {
            simple,
          }),
        )
        .filter((item) => {
          if (!qTrailId) return true
          // qTrailId é aplicado via query, mas mantemos o filtro defensivo.
          return (item as Json).trail_id === qTrailId
        })
        .filter((item) => {
          if (qStageActive === null) return true
          return typeof item.active === 'boolean' ? item.active === qStageActive : false
        })
        .filter((item) => {
          if (qIsReleased === null) return true
          return typeof item.is_released === 'boolean' ? item.is_released === qIsReleased : false
        })

      if (qTrailId) {
        items = [...items].sort((a, b) => {
          const na =
            typeof (a as Json).stage_number === 'number'
              ? ((a as Json).stage_number as number)
              : 0
          const nb =
            typeof (b as Json).stage_number === 'number'
              ? ((b as Json).stage_number as number)
              : 0
          return na - nb
        })
      }

      return jsonResponse(items as Json[], { status: 200, headers: corsHeaders() })
    }

    if (request.method === 'POST') {
      if (id) return respond(400, { error: 'id não deve ser enviado em POST' })

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return respond(400, { error: 'JSON inválido' })
      }

      if (!payload || typeof payload !== 'object') {
        return respond(400, { error: 'Payload inválido' })
      }

      const body = payload as Json

      const trail_id = sanitizeString(body.trail_id)
      const stage_number = parseIntLoose(body.stage_number)
      const title = sanitizeString(body.title)

      if (!trail_id) return respond(400, { error: 'Campo "trail_id" é obrigatório' })
      if (stage_number === null) {
        return respond(400, { error: 'Campo "stage_number" deve ser um inteiro' })
      }
      if (stage_number < 1) {
        return respond(400, { error: 'Campo "stage_number" deve ser >= 1' })
      }
      if (!title) return respond(400, { error: 'Campo "title" é obrigatório' })

      const stage_type = parseStageType(body.stage_type)
      if (!stage_type) {
        return respond(400, {
          error:
            'Campo "stage_type" é obrigatório e deve ser "ai", "fixed" ou "exercise"',
        })
      }

      let promptForPost: string | null
      if (stage_type === 'ai') {
        const p = sanitizeString(body.prompt)
        if (!p) {
          return respond(400, {
            error:
              'Campo "prompt" é obrigatório (string não vazia) quando stage_type é "ai"',
          })
        }
        promptForPost = p
      } else {
        if (body.prompt !== undefined && body.prompt !== null) {
          if (typeof body.prompt === 'string' && body.prompt.trim() === '') {
            promptForPost = null
          } else {
            return respond(400, {
              error:
                'Campo "prompt" deve ser null ou omitido quando stage_type é "fixed" ou "exercise"',
            })
          }
        } else {
          promptForPost = null
        }
      }

      const valid = validateStageTypeAndPrompt(stage_type, promptForPost)
      if (!valid.ok) return respond(400, { error: valid.error })

      const now = FieldValue.serverTimestamp()
      const docId = stageDocId(trail_id, stage_number)
      const docRef = db.collection(collection).doc(docId)

      await db.runTransaction(async (tx) => {
        const existing = await tx.get(docRef)
        if (existing.exists) {
          throw new Error(
            `Conflito: stage_number ${stage_number} já existe para trail_id "${trail_id}".`,
          )
        }

        // Persistência dos campos com defaults solicitados:
        // - `is_released` inicia como false
        // - `active` inicia como true
        tx.set(docRef, {
          trail_id,
          stage_number,
          title,
          stage_type,
          prompt: stage_type === 'ai' ? promptForPost : null,
          is_released: false,
          active: true,
          created_at: now,
          updated_at: now,
        })
      })

      return jsonResponse(
        {
          id: docId,
          trail_id,
          stage_number,
          title,
          stage_type,
          prompt: stage_type === 'ai' ? promptForPost : null,
          is_released: false,
          active: true,
          created_at: null,
          updated_at: null,
        },
        { status: 201, headers: corsHeaders() },
      )
    }

    if (request.method === 'PUT') {
      if (!id) return respond(400, { error: 'id é obrigatório em PUT' })

      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return respond(400, { error: 'JSON inválido' })
      }

      if (!payload || typeof payload !== 'object') {
        return respond(400, { error: 'Payload inválido' })
      }

      const body = payload as Json
      const updates: Json = {}

      const ref = db.collection(collection).doc(id)
      const snap = await ref.get()
      if (!snap.exists) return respond(404, { error: 'Not found' })

      const existing = (snap.data() ?? {}) as Record<string, unknown>

      const existingTrailId =
        typeof existing.trail_id === 'string' ? existing.trail_id : ''
      const existingStageNumber =
        typeof existing.stage_number === 'number' ? existing.stage_number : 0

      if ('trail_id' in body && body.trail_id !== undefined) {
        const requestedTrailId = sanitizeString(body.trail_id)
        if (!requestedTrailId || requestedTrailId !== existingTrailId) {
          return respond(400, {
            error:
              'Atualização de "trail_id" não é suportada (para preservar a unicidade).',
          })
        }
      }

      if ('stage_number' in body && body.stage_number !== undefined) {
        const requestedStageNumber = parseIntLoose(body.stage_number)
        if (requestedStageNumber === null || requestedStageNumber !== existingStageNumber) {
          return respond(400, {
            error:
              'Atualização de "stage_number" não é suportada (para preservar a unicidade).',
          })
        }
      }

      if ('title' in body) {
        if (body.title === undefined) {
          // ignora
        } else {
          const title = sanitizeString(body.title)
          if (!title) return respond(400, { error: 'Campo "title" deve ser uma string não vazia' })
          updates.title = title
        }
      }

      const exType = existingStageType(existing)
      const exPrompt = existingPrompt(existing)

      let nextType = exType
      if ('stage_type' in body && body.stage_type !== undefined) {
        const st = parseStageType(body.stage_type)
        if (!st) {
          return respond(400, {
            error:
              'Campo "stage_type" deve ser "ai", "fixed" ou "exercise"',
          })
        }
        nextType = st
      }

      let nextPrompt = exPrompt
      if ('prompt' in body) {
        const parsed = parsePromptValue(body.prompt)
        if (parsed.kind === 'error') {
          return respond(400, { error: 'Campo "prompt" inválido' })
        }
        if (parsed === 'omit') {
          // não altera (não deve ocorrer com chave presente)
        } else if (parsed.kind === 'null') {
          nextPrompt = null
        } else {
          nextPrompt = parsed.value
        }
      }

      if (nextType !== 'ai') {
        nextPrompt = null
      }

      const pairOk = validateStageTypeAndPrompt(nextType, nextPrompt)
      if (!pairOk.ok) return respond(400, { error: pairOk.error })

      if ('stage_type' in body && body.stage_type !== undefined) {
        updates.stage_type = nextType
      }

      const typeOrPromptTouched =
        ('stage_type' in body && body.stage_type !== undefined) || 'prompt' in body
      if (typeOrPromptTouched) {
        updates.prompt = nextType === 'ai' ? nextPrompt : null
      }

      if ('is_released' in body && body.is_released !== undefined) {
        const is_released = parseBoolean(body.is_released)
        if (is_released === null) {
          return respond(400, { error: 'Campo "is_released" deve ser boolean' })
        }
        updates.is_released = is_released
      }

      if ('active' in body && body.active !== undefined) {
        const active = parseBoolean(body.active)
        if (active === null) {
          return respond(400, { error: 'Campo "active" deve ser boolean' })
        }
        updates.active = active
      }

      if (Object.keys(updates).length === 0) {
        return respond(400, { error: 'Nenhum campo válido para atualizar' })
      }

      updates.updated_at = FieldValue.serverTimestamp()

      await ref.update(updates)
      return jsonResponse({ ok: true, id }, { status: 200, headers: corsHeaders() })
    }

    if (request.method === 'DELETE') {
      if (!id) return respond(400, { error: 'id é obrigatório em DELETE' })

      const ref = db.collection(collection).doc(id)
      const snap = await ref.get()
      if (!snap.exists) return respond(404, { error: 'Not found' })

      await ref.delete()
      return new Response(null, { status: 204, headers: corsHeaders() })
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

