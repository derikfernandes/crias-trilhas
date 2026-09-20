/**
 * Classificação e agregação de uso dos agentes de IA (Chatis).
 * Fonte de verdade alinhada a specs/10_AGENT_USAGE_DASHBOARD.md.
 */

export const CANONICAL_AGENT_TRAIL_IDS = [
  'Trilha - Matemática',
  'Trilha - Geral',
  'Trilha - Humanas',
  'Trilha - Natureza',
  'Tutor - Linguagens',
] as const

export type CanonicalAgentTrailId = (typeof CANONICAL_AGENT_TRAIL_IDS)[number]

const CANONICAL_LABELS: Record<CanonicalAgentTrailId, string> = {
  'Trilha - Matemática': 'Matemática',
  'Trilha - Geral': 'Geral',
  'Trilha - Humanas': 'Humanas',
  'Trilha - Natureza': 'Natureza',
  'Tutor - Linguagens': 'Linguagens',
}

const CANONICAL_SET = new Set<string>(CANONICAL_AGENT_TRAIL_IDS)

export function isAgentTrailId(trailId: string): boolean {
  const id = trailId.trim()
  if (!id) return false
  if (CANONICAL_SET.has(id)) return true
  return id.startsWith('Trilha -') || id.startsWith('Tutor -')
}

export function agentLabelForTrailId(trailId: string): string {
  const id = trailId.trim()
  if (id in CANONICAL_LABELS) {
    return CANONICAL_LABELS[id as CanonicalAgentTrailId]
  }
  if (id.startsWith('Trilha -')) return id.slice('Trilha -'.length).trim() || id
  if (id.startsWith('Tutor -')) return id.slice('Tutor -'.length).trim() || id
  return id
}

export type AgentUsageLogInput = {
  student_id: string
  trail_id: string
  at: number
}

export type AgentUsageRow = {
  trail_id: string
  label: string
  messages: number
  unique_students: number
  pct_of_total: number
  last_activity: string | null
  student_ids: string[]
}

export type AgentUsageSeriesPoint = {
  date: string
  trail_id: string
  messages: number
}

export type AgentUsageAggregate = {
  period_days: number
  total_messages: number
  agents: AgentUsageRow[]
  series: AgentUsageSeriesPoint[]
}

function pctOfTotal(messages: number, total: number): number {
  if (total <= 0 || messages <= 0) return 0
  return Math.round((messages / total) * 1000) / 10
}

function toIsoOrNull(ms: number): string | null {
  if (!ms || ms <= 0) return null
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

/** Data civil America/Sao_Paulo a partir de epoch ms. */
export function brasiliaDateKey(ms: number): string {
  if (!ms || ms <= 0) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const y = map.year
  const m = map.month
  const d = map.day
  if (!y || !m || !d) return ''
  return `${y}-${m}-${d}`
}

export function aggregateAgentUsage(
  logs: AgentUsageLogInput[],
  periodDays: number = 0,
): AgentUsageAggregate {
  const byTrail = new Map<
    string,
    { messages: number; students: Set<string>; lastAt: number }
  >()
  const seriesMap = new Map<string, number>()

  let totalMessages = 0

  for (const log of logs) {
    const trailId = typeof log.trail_id === 'string' ? log.trail_id.trim() : ''
    if (!isAgentTrailId(trailId)) continue

    totalMessages += 1
    let bucket = byTrail.get(trailId)
    if (!bucket) {
      bucket = { messages: 0, students: new Set(), lastAt: 0 }
      byTrail.set(trailId, bucket)
    }
    bucket.messages += 1
    if (log.student_id?.trim()) bucket.students.add(log.student_id.trim())
    if (log.at > bucket.lastAt) bucket.lastAt = log.at

    const day = brasiliaDateKey(log.at)
    if (day) {
      const seriesKey = `${day}\0${trailId}`
      seriesMap.set(seriesKey, (seriesMap.get(seriesKey) ?? 0) + 1)
    }
  }

  const agents: AgentUsageRow[] = []
  const seen = new Set<string>()

  for (const trailId of CANONICAL_AGENT_TRAIL_IDS) {
    seen.add(trailId)
    const bucket = byTrail.get(trailId)
    const messages = bucket?.messages ?? 0
    const studentIds = bucket ? [...bucket.students].sort() : []
    agents.push({
      trail_id: trailId,
      label: agentLabelForTrailId(trailId),
      messages,
      unique_students: studentIds.length,
      pct_of_total: pctOfTotal(messages, totalMessages),
      last_activity: toIsoOrNull(bucket?.lastAt ?? 0),
      student_ids: studentIds,
    })
  }

  const extras = [...byTrail.keys()]
    .filter((id) => !seen.has(id))
    .sort((a, b) => {
      const mb = byTrail.get(b)?.messages ?? 0
      const ma = byTrail.get(a)?.messages ?? 0
      if (mb !== ma) return mb - ma
      return a.localeCompare(b)
    })

  for (const trailId of extras) {
    const bucket = byTrail.get(trailId)!
    const studentIds = [...bucket.students].sort()
    agents.push({
      trail_id: trailId,
      label: agentLabelForTrailId(trailId),
      messages: bucket.messages,
      unique_students: studentIds.length,
      pct_of_total: pctOfTotal(bucket.messages, totalMessages),
      last_activity: toIsoOrNull(bucket.lastAt),
      student_ids: studentIds,
    })
  }

  const series: AgentUsageSeriesPoint[] = [...seriesMap.entries()]
    .map(([key, messages]) => {
      const sep = key.indexOf('\0')
      return {
        date: key.slice(0, sep),
        trail_id: key.slice(sep + 1),
        messages,
      }
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.trail_id.localeCompare(b.trail_id)
    })

  return {
    period_days: periodDays,
    total_messages: totalMessages,
    agents,
    series,
  }
}

export function parsePeriodDays(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return 0
  const n = Number(raw)
  if (n === 7 || n === 30) return n
  return 0
}

/** Epoch mínimo inclusivo para o filtro de período (agora − N dias). */
export function periodCutoffMillis(periodDays: number, nowMs: number = Date.now()): number {
  if (periodDays <= 0) return 0
  return nowMs - periodDays * 24 * 60 * 60 * 1000
}
