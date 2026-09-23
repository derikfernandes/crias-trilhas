/**
 * Cliente Gemini via Generative Language API ou Vertex AI `generateContent`.
 * Credenciais só via env Vercel — nunca hardcoded.
 *
 * Rotas:
 * - VERTEX_PROJECT_ID + VERTEX_LOCATION + OAuth → Vertex AI (scope cloud-platform)
 * - OAuth sem VERTEX_* → Generative Language (scope generative-language ou cloud-platform)
 * - GEMINI_API_KEY → Generative Language `?key=` (sem OAuth)
 */

export type GeminiGenerateInput = {
  systemInstruction: string
  userText: string
}

export type GeminiGenerateResult = {
  text: string
  model: string
}

/** Scopes mínimos documentados para o refresh token OAuth. */
export const GOOGLE_OAUTH_SCOPES = {
  /** Vertex AI / AI Platform generateContent */
  cloudPlatform: 'https://www.googleapis.com/auth/cloud-platform',
  /** Generative Language API (AI Studio / generativelanguage.googleapis.com) */
  generativeLanguage: 'https://www.googleapis.com/auth/generative-language',
} as const

function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return readEnv('GEMINI_MODEL', env) || 'gemini-2.0-flash'
}

/** Modelo efetivo: VERTEX_MODEL quando no caminho Vertex; senão GEMINI_MODEL. */
export function resolveTrailAiModel(
  env: NodeJS.ProcessEnv = process.env,
  opts: { useVertex: boolean } = { useVertex: false },
): string {
  if (opts.useVertex) {
    return (
      readEnv('VERTEX_MODEL', env) ||
      readEnv('GEMINI_MODEL', env) ||
      'gemini-2.0-flash'
    )
  }
  return resolveGeminiModel(env)
}

export function isTrailAiDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnv('TRAIL_AI_DISABLED', env) === '1'
}

export type VertexTarget = {
  projectId: string
  location: string
}

/** VERTEX_* ativos quando project + location estão setados (proxy port é só local — ignorado). */
export function resolveVertexTarget(
  env: NodeJS.ProcessEnv = process.env,
): VertexTarget | null {
  const projectId = readEnv('VERTEX_PROJECT_ID', env)
  const location = readEnv('VERTEX_LOCATION', env)
  if (!projectId || !location) return null
  return { projectId, location }
}

function generativeLanguageBase(env: NodeJS.ProcessEnv): string {
  return (
    readEnv('GOOGLE_AI_API_BASE', env) ||
    'https://generativelanguage.googleapis.com/v1beta'
  )
}

/**
 * URL Vertex AI generateContent.
 * location=global → host aiplatform.googleapis.com; senão {location}-aiplatform.googleapis.com
 */
export function buildVertexGenerateContentUrl(
  target: VertexTarget,
  model: string,
): string {
  const { projectId, location } = target
  const host =
    location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${location}-aiplatform.googleapis.com`
  return (
    `${host}/v1/projects/${encodeURIComponent(projectId)}` +
    `/locations/${encodeURIComponent(location)}` +
    `/publishers/google/models/${encodeURIComponent(model)}:generateContent`
  )
}

async function fetchAccessToken(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const clientId = readEnv('GOOGLE_OAUTH_CLIENT_ID', env)
  const clientSecret = readEnv('GOOGLE_OAUTH_CLIENT_SECRET', env)
  const refreshToken = readEnv('GOOGLE_OAUTH_REFRESH_TOKEN', env)
  if (!clientId || !clientSecret || !refreshToken) return null

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `OAuth refresh falhou (${res.status}): ${errText.slice(0, 200)}`,
    )
  }
  const json = (await res.json()) as { access_token?: unknown }
  return typeof json.access_token === 'string' ? json.access_token : null
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return ''
  const first = candidates[0] as { content?: { parts?: unknown } }
  const parts = first?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) =>
      p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string'
        ? (p as { text: string }).text
        : '',
    )
    .join('')
    .trim()
}

function isInsufficientScopeError(status: number, errText: string): boolean {
  if (status !== 403) return false
  const lower = errText.toLowerCase()
  return (
    lower.includes('access_token_scope_insufficient') ||
    lower.includes('insufficient authentication scopes') ||
    lower.includes('insufficientpermissions')
  )
}

function scopeGuidance(useVertex: boolean): string {
  const cloud = GOOGLE_OAUTH_SCOPES.cloudPlatform
  const gen = GOOGLE_OAUTH_SCOPES.generativeLanguage
  if (useVertex) {
    return (
      `OAuth sem scope suficiente para Vertex AI. Renove o refresh token com ` +
      `${cloud} — ou use GEMINI_API_KEY (Generative Language, sem OAuth) em Preview+Production e remova o trio GOOGLE_OAUTH_* se não precisar de Vertex.`
    )
  }
  return (
    `OAuth sem scope suficiente para Generative Language. Renove o refresh token com ` +
    `${gen} e/ou ${cloud}; ou sete VERTEX_PROJECT_ID + VERTEX_LOCATION (com OAuth ${cloud}) para usar Vertex; ` +
    `ou use GEMINI_API_KEY (caminho mais simples, sem OAuth scopes).`
  )
}

/**
 * Chama `models/{model}:generateContent` (Generative Language) ou
 * Vertex `publishers/google/models/{model}:generateContent` quando VERTEX_* + OAuth.
 * Preferência auth: OAuth refresh; fallback: `GEMINI_API_KEY` (só Generative Language).
 */
export async function generateContentWithGemini(
  input: GeminiGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiGenerateResult> {
  if (isTrailAiDisabled(env)) {
    throw new Error('TRAIL_AI_DISABLED=1 — geração desligada.')
  }

  const vertex = resolveVertexTarget(env)
  const accessToken = await fetchAccessToken(env, fetchImpl)
  const apiKey = readEnv('GEMINI_API_KEY', env)

  const useVertex = Boolean(vertex && accessToken)
  const model = resolveTrailAiModel(env, { useVertex })

  let url: URL
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (useVertex && vertex) {
    url = new URL(buildVertexGenerateContentUrl(vertex, model))
    headers.Authorization = `Bearer ${accessToken}`
  } else {
    const base = generativeLanguageBase(env).replace(/\/+$/, '')
    url = new URL(`${base}/models/${encodeURIComponent(model)}:generateContent`)
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    } else if (apiKey) {
      url.searchParams.set('key', apiKey)
    } else {
      throw new Error(
        'Gemini/Vertex não configurado. No projeto Vercel (crias-trilhas): Settings → Environment Variables → ' +
          'defina GEMINI_API_KEY (caminho mais simples) em Preview e Production; ' +
          'ou GOOGLE_OAUTH_* + VERTEX_PROJECT_ID + VERTEX_LOCATION (OAuth com scope cloud-platform); ' +
          'ou só GOOGLE_OAUTH_* com scope generative-language. Redeploy o Preview depois de salvar.',
      )
    }
  }

  const body = {
    systemInstruction: {
      parts: [{ text: input.systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: input.userText }],
      },
    ],
  }

  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (isInsufficientScopeError(res.status, errText)) {
      throw new Error(
        `generateContent falhou (403): ${scopeGuidance(useVertex)} Detalhe: ${errText.slice(0, 180)}`,
      )
    }
    throw new Error(
      `generateContent falhou (${res.status}): ${errText.slice(0, 300)}`,
    )
  }

  const json = (await res.json()) as unknown
  const text = extractText(json)
  if (!text) {
    throw new Error('generateContent devolveu texto vazio.')
  }

  return { text, model }
}
