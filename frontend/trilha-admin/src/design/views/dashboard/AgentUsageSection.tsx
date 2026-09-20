import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  DashboardAgentPeriodDays,
  DashboardAgentStudentLink,
  DashboardAgentUsageView,
} from '../../types/dashboardPageView'

type AgentSortKey =
  | 'label'
  | 'messages'
  | 'uniqueStudents'
  | 'pctOfTotal'
  | 'lastActivity'

type AgentUsageSectionProps = {
  agentUsage: DashboardAgentUsageView
  periodDays: DashboardAgentPeriodDays
  onPeriodDaysChange: (days: DashboardAgentPeriodDays) => void
  loading: boolean
  selectedAgentTrailId: string | null
  onSelectAgentTrailId: (trailId: string | null) => void
  selectedAgentStudents: DashboardAgentStudentLink[]
}

const PERIOD_OPTIONS: { value: DashboardAgentPeriodDays; label: string }[] = [
  { value: 0, label: 'Todo o período' },
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
]

export function AgentUsageSection({
  agentUsage,
  periodDays,
  onPeriodDaysChange,
  loading,
  selectedAgentTrailId,
  onSelectAgentTrailId,
  selectedAgentStudents,
}: AgentUsageSectionProps) {
  const [sort, setSort] = useState<{ key: AgentSortKey; dir: 'asc' | 'desc' }>({
    key: 'messages',
    dir: 'desc',
  })

  const sortedAgents = useMemo(() => {
    const rows = [...agentUsage.agents]
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sort.key) {
        case 'label':
          return a.label.localeCompare(b.label, 'pt-BR') * dir
        case 'messages':
          return (a.messages - b.messages) * dir
        case 'uniqueStudents':
          return (a.uniqueStudents - b.uniqueStudents) * dir
        case 'pctOfTotal':
          return (a.pctOfTotal - b.pctOfTotal) * dir
        case 'lastActivity':
          return (
            a.lastActivityLabel.localeCompare(b.lastActivityLabel, 'pt-BR') * dir
          )
        default:
          return 0
      }
    })
    return rows
  }, [agentUsage.agents, sort])

  const toggleSort = (key: AgentSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'label' ? 'asc' : 'desc' },
    )
  }

  const sortIndicator = (key: AgentSortKey) => {
    if (sort.key !== key) return ''
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  const barMax = Math.max(1, ...agentUsage.agents.map((a) => a.messages))
  const shareSegments = agentUsage.agents
    .filter((a) => a.messages > 0)
    .reduce<{ cursor: number; segments: string[]; legend: typeof agentUsage.agents }>(
      (acc, agent, idx) => {
        const colors = [
          'var(--accent, #0f766e)',
          '#2563eb',
          '#ca8a04',
          '#dc2626',
          '#7c3aed',
          '#0891b2',
        ]
        const start = acc.cursor
        const end =
          agentUsage.totalMessages > 0
            ? acc.cursor + (agent.messages / agentUsage.totalMessages) * 100
            : acc.cursor
        return {
          cursor: end,
          segments: [
            ...acc.segments,
            `${colors[idx % colors.length]} ${start}% ${end}%`,
          ],
          legend: [...acc.legend, agent],
        }
      },
      { cursor: 0, segments: [], legend: [] },
    )

  const seriesByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const point of agentUsage.series) {
      map.set(point.date, (map.get(point.date) ?? 0) + point.messages)
    }
    return [...map.entries()]
      .map(([date, messages]) => ({ date, messages }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [agentUsage.series])
  const seriesMax = Math.max(1, ...seriesByDate.map((p) => p.messages))

  const selectedAgent = agentUsage.agents.find(
    (a) => a.trailId === selectedAgentTrailId,
  )

  return (
    <section
      className={`dashboard-agent-usage${loading ? ' dashboard-agent-usage--loading' : ''}`}
      aria-label="Uso de agentes de IA"
      aria-busy={loading}
    >
      <div className="dashboard-agent-usage__header">
        <div>
          <h2 className="dashboard-agent-usage__title">Agentes de IA</h2>
          <p className="muted dashboard-agent-usage__lede">
            Volume de mensagens nos agentes fora da trilha estruturada.
          </p>
        </div>
        <label className="dashboard-agent-usage__period">
          <span className="muted">Período</span>
          <select
            value={periodDays}
            onChange={(e) =>
              onPeriodDaysChange(Number(e.target.value) as DashboardAgentPeriodDays)
            }
            disabled={loading}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted dashboard-agent-usage__status" role="status">
          Atualizando uso dos agentes…
        </p>
      ) : null}

      {agentUsage.totalMessages === 0 && !loading ? (
        <p className="muted dashboard-agent-usage__empty">
          Nenhuma interação com agentes no período.
        </p>
      ) : (
        <>
          <div className="dashboard-agent-usage__charts">
            <article className="dashboard-q-charts__card dashboard-agent-usage__chart">
              <h3>Mensagens por agente</h3>
              <ul className="dashboard-q-charts__bars">
                {agentUsage.agents.map((agent) => (
                  <li key={agent.trailId}>
                    <button
                      type="button"
                      className={`dashboard-student-charts__filter-button${
                        selectedAgentTrailId === agent.trailId
                          ? ' dashboard-student-charts__filter-button--selected'
                          : ''
                      }`}
                      onClick={() =>
                        onSelectAgentTrailId(
                          selectedAgentTrailId === agent.trailId
                            ? null
                            : agent.trailId,
                        )
                      }
                    >
                      <span className="dashboard-q-charts__bar-label">
                        {agent.label}
                      </span>
                      <span className="dashboard-q-charts__bar-track">
                        <span
                          className="dashboard-q-charts__bar-fill"
                          style={{
                            width: `${(agent.messages / barMax) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="dashboard-q-charts__bar-value">
                        {agent.messages}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="dashboard-q-charts__card dashboard-agent-usage__chart">
              <h3>Participação</h3>
              <div
                className="dashboard-agent-usage__share"
                style={{
                  background:
                    shareSegments.segments.length > 0
                      ? `conic-gradient(${shareSegments.segments.join(', ')})`
                      : 'var(--border)',
                }}
                role="img"
                aria-label={`Total de ${agentUsage.totalMessages} mensagens`}
              />
              <ul className="dashboard-agent-usage__share-legend">
                {agentUsage.agents
                  .filter((a) => a.messages > 0)
                  .map((agent) => (
                    <li key={agent.trailId}>
                      <span>{agent.label}</span>
                      <strong>{agent.pctOfTotal}%</strong>
                    </li>
                  ))}
              </ul>
            </article>

            {seriesByDate.length > 0 ? (
              <article className="dashboard-q-charts__card dashboard-agent-usage__chart dashboard-agent-usage__chart--wide">
                <h3>Mensagens por dia</h3>
                <ul className="dashboard-agent-usage__series" aria-label="Série temporal">
                  {seriesByDate.map((point) => (
                    <li key={point.date} title={`${point.date}: ${point.messages}`}>
                      <span
                        className="dashboard-agent-usage__series-bar"
                        style={{
                          height: `${Math.max(8, (point.messages / seriesMax) * 100)}%`,
                        }}
                      />
                      <span className="dashboard-agent-usage__series-label">
                        {point.date.slice(5)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </div>

          <div className="table-wrap dashboard-agent-usage__table-wrap">
            <table className="data-table dashboard-agent-usage__table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('label')}>
                      Agente{sortIndicator('label')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('messages')}>
                      Mensagens{sortIndicator('messages')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => toggleSort('uniqueStudents')}
                    >
                      Alunos únicos{sortIndicator('uniqueStudents')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => toggleSort('pctOfTotal')}
                    >
                      % do total{sortIndicator('pctOfTotal')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => toggleSort('lastActivity')}
                    >
                      Última atividade{sortIndicator('lastActivity')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent) => (
                  <tr
                    key={agent.trailId}
                    className={
                      selectedAgentTrailId === agent.trailId
                        ? 'dashboard-agent-usage__row--selected'
                        : undefined
                    }
                    onClick={() =>
                      onSelectAgentTrailId(
                        selectedAgentTrailId === agent.trailId
                          ? null
                          : agent.trailId,
                      )
                    }
                  >
                    <td>{agent.label}</td>
                    <td>{agent.messages}</td>
                    <td>{agent.uniqueStudents}</td>
                    <td>{agent.pctOfTotal}%</td>
                    <td>{agent.lastActivityLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedAgent ? (
        <div className="dashboard-agent-usage__detail panel">
          <div className="dashboard-agent-usage__detail-head">
            <h3>Alunos em {selectedAgent.label}</h3>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onSelectAgentTrailId(null)}
            >
              Fechar
            </button>
          </div>
          {selectedAgentStudents.length === 0 ? (
            <p className="muted">
              Nenhum aluno identificado neste período para este agente.
            </p>
          ) : (
            <ul className="dashboard-agent-usage__students">
              {selectedAgentStudents.map((student) => (
                <li key={student.id}>
                  <Link to={student.href}>{student.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
