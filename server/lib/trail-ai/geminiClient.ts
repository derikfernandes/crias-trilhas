/**
 * Cliente Gemini via Google AI Platform / Generative Language `generateContent`.
 * Credenciais só via env Vercel — nunca hardcoded.
 */

export type GeminiGenerateInput = {
  systemInstruction: string
  userText: string
}

export type GeminiGenerateResult = {
  text: string
  model: string
}

function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return readEnv('GEMINI_MODEL', env) || 'gemini-2.0-flash'
}

export function isTrailAiDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnv('TRAIL_AI_DISABLED', env) === '1'
}

function apiBase(env: NodeJS.ProcessEnv): string {
  return (
    readEnv('GOOGLE_AI_API_BASE', env) ||
    'https://generativelanguage.googleapis.com/v1beta'
  )
}

async function fetchAccessToken(
  env: NodeJS.ProcessEnv,
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

  const res = await fetch('https://oauth2.googleapis.com/token', {
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

/**
 * Chama `models/{model}:generateContent`.
 * Preferência: OAuth refresh; fallback: `GEMINI_API_KEY`.
 */
export async function generateContentWithGemini(
  input: GeminiGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiGenerateResult> {
  if (isTrailAiDisabled(env)) {
    throw new Error('TRAIL_AI_DISABLED=1 — geração desligada.')
  }

  const model = resolveGeminiModel(env)
  const base = apiBase(env).replace(/\/+$/, '')
  const url = new URL(`${base}/models/${encodeURIComponent(model)}:generateContent`)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const apiKey = readEnv('GEMINI_API_KEY', env)
  const accessToken = await fetchAccessToken(env)
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  } else if (apiKey) {
    url.searchParams.set('key', apiKey)
  } else {
    throw new Error(
      'Gemini não configurado. No projeto Vercel (crias-trilhas): Settings → Environment Variables → defina GEMINI_API_KEY (caminho mais simples) em Preview e Production — ou o trio GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN. Redeploy o Preview depois de salvar.',
    )
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
