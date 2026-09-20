/**
 * Constantes e helpers de agentes no frontend (espelho de server/lib/agentUsage).
 * Mantido local para respeitar a fronteira design/pages ↔ api.
 */

export const CANONICAL_AGENT_TRAIL_IDS = [
  'Trilha - Matemática',
  'Trilha - Geral',
  'Trilha - Humanas',
  'Trilha - Natureza',
  'Tutor - Linguagens',
] as const

export type AgentUsagePeriodDays = 0 | 7 | 30

export type AgentUsageRowView = {
  trailId: string
  label: string
  messages: number
  uniqueStudents: number
  pctOfTotal: number
  lastActivity: string | null
  studentIds: string[]
}

export type AgentUsageSeriesPointView = {
  date: string
  trailId: string
  messages: number
}

export type AgentUsageView = {
  periodDays: AgentUsagePeriodDays
  totalMessages: number
  agents: AgentUsageRowView[]
  series: AgentUsageSeriesPointView[]
}

export const EMPTY_AGENT_USAGE: AgentUsageView = {
  periodDays: 0,
  totalMessages: 0,
  agents: CANONICAL_AGENT_TRAIL_IDS.map((trailId) => ({
    trailId,
    label: trailId.replace(/^Trilha - |^Tutor - /, ''),
    messages: 0,
    uniqueStudents: 0,
    pctOfTotal: 0,
    lastActivity: null,
    studentIds: [],
  })),
  series: [],
}

export function formatAgentLastActivity(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return '—'
  }
}
