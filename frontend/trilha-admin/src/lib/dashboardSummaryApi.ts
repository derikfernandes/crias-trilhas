/**
 * Cliente do endpoint /api/dashboard_summary: agregação server-side dos
 * conversation_logs, evitando baixar todos os logs brutos no browser.
 *
 * O endpoint devolve um formato compacto (trilhas referenciadas por índice e
 * chaves "trailIdx|stage|question"); aqui as chaves são expandidas para o
 * formato que o dashboard já usava: "trailId|stage|question".
 */

export type DashboardLogSummary = {
  doneByStudent: Map<string, Set<string>>
  answerMap: Map<string, string>
}

function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim()
  if (raw) return raw.replace(/\/+$/, '')
  return window.location.origin
}

type DashboardSummaryResponse = {
  trail_ids?: string[]
  students?: Record<
    string,
    { answers?: Record<string, string>; extra_done?: string[] }
  >
  error?: string
}

function expandKey(compactKey: string, trailIds: string[]): string | null {
  const sep = compactKey.indexOf('|')
  if (sep < 0) return null
  const trailIdx = Number(compactKey.slice(0, sep))
  const trailId = trailIds[trailIdx]
  if (!trailId) return null
  return `${trailId}${compactKey.slice(sep)}`
}

export async function fetchDashboardLogSummary(
  institutionId: string,
): Promise<DashboardLogSummary> {
  const url = new URL('/api/dashboard_summary', resolveApiBaseUrl())
  url.searchParams.set('institution_id', institutionId)

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  let body: DashboardSummaryResponse | null = null
  try {
    body = (await res.json()) as DashboardSummaryResponse
  } catch {
    body = null
  }

  if (!res.ok) {
    const message =
      body?.error?.trim() ||
      `Falha ao carregar métricas do dashboard (HTTP ${res.status}).`
    throw new Error(message)
  }

  // Sem o endpoint (ex.: Vite dev ou deploy antigo), o fallback de SPA devolve
  // 200 com index.html. Valida a forma da resposta para não tratar isso como
  // "sem dados" — lançar erro aqui aciona o fallback legado no dashboard.
  if (
    !body ||
    typeof body.students !== 'object' ||
    body.students === null ||
    !Array.isArray(body.trail_ids)
  ) {
    throw new Error(
      'Resposta inválida de /api/dashboard_summary (endpoint indisponível?).',
    )
  }

  const trailIds = body.trail_ids
  const doneByStudent = new Map<string, Set<string>>()
  const answerMap = new Map<string, string>()

  for (const [studentId, entry] of Object.entries(body?.students ?? {})) {
    const done = new Set<string>()
    for (const [compactKey, answer] of Object.entries(entry.answers ?? {})) {
      const key = expandKey(compactKey, trailIds)
      if (!key) continue
      done.add(key)
      answerMap.set(`${studentId}|${key}`, answer)
    }
    for (const compactKey of entry.extra_done ?? []) {
      const key = expandKey(compactKey, trailIds)
      if (!key) continue
      done.add(key)
    }
    if (done.size > 0) doneByStudent.set(studentId, done)
  }

  return { doneByStudent, answerMap }
}
