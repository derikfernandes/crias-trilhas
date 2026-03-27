import { cert, getApps, initializeApp } from 'firebase-admin/app'
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
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (!Number.isInteger(v)) return null
    return v
  }
  if (typeof v !== 'string') return null
  const n = Number.parseInt(v.trim(), 10)
  if (!Number.isFinite(n)) return null
  if (!Number.isInteger(n)) return null
  return n
}

function toTrailOutput(
  data: Record<string, unknown>,
  id: string,
  opts?: { simple?: boolean },
): Json {
  const institution_id =
    typeof data.institution_id === 'string' ? data.institution_id : ''
  const name = typeof data.name === 'string' ? data.name : ''
  const description =
    typeof data.description === 'string' ? data.description : ''
  const subject = typeof data.subject === 'string' ? data.subject : ''
  const default_total_steps_per_stage =
    typeof data.default_total_steps_per_stage === 'number'
      ? data.default_total_steps_per_stage
      : 0
  const active = typeof data.active === 'boolean' ? data.active : false

  if (opts?.simple) {
    return {
      id,
      institution_id,
      name,
      subject,
      active,
    }
  }

  return {
    id,
    institution_id,
    name,
    description,
    subject,
    default_total_steps_per_stage,
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

  const collection = process.env.TRAILS_COLLECTION ?? 'trails'

  const respond = (status: number, body: Json): Response => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
      },
    })
  }

  const qInstitutionId = url.searchParams.get('institution_id')?.trim() || null
  const qActive = parseBoolean(url.searchParams.get('active') ?? '') ?? null

  try {
    // GET /trails/
    // GET /trails/simple
    // GET /trails/:id (via ?id=:id)
    if (request.method === 'GET') {
      if (id) {
        const snap = await db.collection(collection).doc(id).get()
        if (!snap.exists) return respond(404, { error: 'Not found' })
        const data = (snap.data() ?? {}) as Record<string, unknown>
        return jsonResponse(
          toTrailOutput(data, snap.id, { simple }),
          { status: 200, headers: corsHeaders() },
        )
      }

      const snap = await db.collection(collection).orderBy('updated_at', 'desc').get()

      const items = snap.docs
        .map((d) => toTrailOutput((d.data() ?? {}) as Record<string, unknown>, d.id, { simple }))
        .filter((item) => {
          const instOk =
            qInstitutionId ? item.institution_id === qInstitutionId : true
          if (!instOk) return false
          if (qActive === null) return true
          return typeof item.active === 'boolean' ? item.active === qActive : false
        })

      return jsonResponse(items as Json[], {
        status: 200,
        headers: corsHeaders(),
      })
    }

    // POST /trails/
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

      const institution_id = sanitizeString(body.institution_id)
      const name = sanitizeString(body.name)
      const description = sanitizeString(body.description)
      const subject = sanitizeString(body.subject)

      if (!institution_id) return respond(400, { error: 'Campo "institution_id" é obrigatório' })
      if (!name) return respond(400, { error: 'Campo "name" é obrigatório' })
      if (!description) return respond(400, { error: 'Campo "description" é obrigatório' })
      if (!subject) return respond(400, { error: 'Campo "subject" é obrigatório' })

      const steps =
        body.default_total_steps_per_stage === undefined
          ? 8
          : parseIntLoose(body.default_total_steps_per_stage)

      if (steps === null) {
        return respond(400, {
          error: 'Campo "default_total_steps_per_stage" deve ser um inteiro',
        })
      }
      if (steps < 0) {
        return respond(400, {
          error: 'Campo "default_total_steps_per_stage" não pode ser negativo',
        })
      }

      const active =
        body.active === undefined ? true : parseBoolean(body.active) ?? null
      if (active === null) {
        return respond(400, {
          error: 'Campo "active" deve ser boolean (ou string booleana)',
        })
      }

      const now = FieldValue.serverTimestamp()
      const ref = await db.collection(collection).add({
        institution_id,
        name,
        description,
        subject,
        default_total_steps_per_stage: steps,
        active,
        created_at: now,
        updated_at: now,
      })

      return jsonResponse(
        {
          id: ref.id,
          institution_id,
          name,
          description,
          subject,
          default_total_steps_per_stage: steps,
          active,
          created_at: null,
          updated_at: null,
        },
        { status: 201, headers: corsHeaders() },
      )
    }

    // PUT /trails/:id (via ?id=:id)
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

      const institution_id = sanitizeString(body.institution_id)
      if (institution_id) updates.institution_id = institution_id

      const name = sanitizeString(body.name)
      if (name) updates.name = name

      const description = sanitizeString(body.description)
      if (description) updates.description = description

      const subject = sanitizeString(body.subject)
      if (subject) updates.subject = subject

      if ('default_total_steps_per_stage' in body) {
        if (body.default_total_steps_per_stage === undefined) {
          // ignora
        } else {
          const steps = parseIntLoose(body.default_total_steps_per_stage)
          if (steps === null) {
            return respond(400, {
              error: 'Campo "default_total_steps_per_stage" deve ser um inteiro',
            })
          }
          if (steps < 0) {
            return respond(400, {
              error: 'Campo "default_total_steps_per_stage" não pode ser negativo',
            })
          }
          updates.default_total_steps_per_stage = steps
        }
      }

      if (body.active !== undefined) {
        const active = parseBoolean(body.active)
        if (active === null) {
          return respond(400, {
            error: 'Campo "active" deve ser boolean (ou string booleana)',
          })
        }
        updates.active = active
      }

      updates.updated_at = FieldValue.serverTimestamp()

      const ref = db.collection(collection).doc(id)
      const snap = await ref.get()
      if (!snap.exists) return respond(404, { error: 'Not found' })

      await ref.update(updates)
      return jsonResponse({ ok: true, id }, { status: 200, headers: corsHeaders() })
    }

    // DELETE /trails/:id (via ?id=:id)
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

