import type {
  DashboardStudentChartFilter,
  DashboardStudentsChartBucket,
  DashboardStudentsStatus,
} from '../../types/dashboardPageView'

type StudentsChartsProps = {
  studentCount: number
  completionBuckets: DashboardStudentsChartBucket[]
  statuses: DashboardStudentsStatus[]
  selectedFilter: DashboardStudentChartFilter | null
  onFilterChange: (filter: DashboardStudentChartFilter | null) => void
}

const STATUS_COLORS: Record<DashboardStudentsStatus['key'], string> = {
  notStarted: '#dc2626',
  inProgress: '#f59e0b',
  completed: '#16a34a',
}

export function StudentsCharts({
  studentCount,
  completionBuckets,
  statuses,
  selectedFilter,
  onFilterChange,
}: StudentsChartsProps) {
  const bucketMax = Math.max(1, ...completionBuckets.map((item) => item.count))

  const statusSegments = statuses
    .filter((status) => status.count > 0)
    .reduce<{ cursor: number; segments: string[] }>(
      (acc, status) => {
        const start = acc.cursor
        const end =
          studentCount > 0
            ? acc.cursor + (status.count / studentCount) * 100
            : acc.cursor
        return {
          cursor: end,
          segments: [
            ...acc.segments,
            `${STATUS_COLORS[status.key]} ${start}% ${end}%`,
          ],
        }
      },
      { cursor: 0, segments: [] },
    ).segments
  const statusBackground =
    statusSegments.length > 0
      ? `conic-gradient(${statusSegments.join(', ')})`
      : 'var(--border)'
  const toggleFilter = (filter: DashboardStudentChartFilter) => {
    const alreadySelected =
      selectedFilter?.kind === filter.kind && selectedFilter.key === filter.key
    onFilterChange(alreadySelected ? null : filter)
  }

  return (
    <section className="dashboard-student-charts" aria-label="Gráficos dos alunos">
      <div className="dashboard-student-charts__grid">
        <article className="dashboard-q-charts__card">
          <h3>Distribuição da conclusão</h3>
          <p className="muted dashboard-q-charts__hint">
            Quantos alunos estão em cada faixa de progresso.
          </p>
          <ul className="dashboard-q-charts__bars">
            {completionBuckets.map((bucket) => (
              <li key={bucket.key}>
                <button
                  type="button"
                  className={`dashboard-student-charts__filter-button${
                    selectedFilter?.kind === 'completion' &&
                    selectedFilter.key === bucket.key
                      ? ' dashboard-student-charts__filter-button--selected'
                      : ''
                  }`}
                  aria-pressed={
                    selectedFilter?.kind === 'completion' &&
                    selectedFilter.key === bucket.key
                  }
                  onClick={() =>
                    toggleFilter({
                      kind: 'completion',
                      key: bucket.key,
                      label: bucket.label,
                    })
                  }
                >
                  <span className="dashboard-q-charts__bar-label">
                    {bucket.label}
                  </span>
                  <span
                    className="dashboard-q-charts__bar-track"
                    aria-label={`${bucket.label}: ${bucket.count} alunos`}
                  >
                    <span
                      className="dashboard-q-charts__bar-fill dashboard-q-charts__bar-fill--accent"
                      style={{ width: `${(bucket.count / bucketMax) * 100}%` }}
                    />
                  </span>
                  <span className="dashboard-q-charts__bar-value">
                    {bucket.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="dashboard-q-charts__card">
          <h3>Status de engajamento</h3>
          <p className="muted dashboard-q-charts__hint">
            Situação dos alunos conforme o progresso filtrado.
          </p>
          <div
            className="dashboard-q-charts__donut"
            style={{ background: statusBackground }}
            role="img"
            aria-label={statuses
              .map((status) => `${status.label}: ${status.count}`)
              .join(', ')}
          >
            <div className="dashboard-q-charts__donut-hole">
              <strong>{studentCount}</strong>
              <span className="muted">
                {studentCount === 1 ? 'aluno' : 'alunos'}
              </span>
            </div>
          </div>
          <div className="dashboard-student-charts__legend">
            {statuses.map((status) => (
              <button
                key={status.key}
                type="button"
                className={`dashboard-student-charts__status-button${
                  selectedFilter?.kind === 'status' &&
                  selectedFilter.key === status.key
                    ? ' dashboard-student-charts__status-button--selected'
                    : ''
                }`}
                aria-pressed={
                  selectedFilter?.kind === 'status' &&
                  selectedFilter.key === status.key
                }
                onClick={() =>
                  toggleFilter({
                    kind: 'status',
                    key: status.key,
                    label: status.label,
                  })
                }
              >
                <i
                  className="dashboard-student-charts__swatch"
                  style={{ background: STATUS_COLORS[status.key] }}
                />
                {status.label} <strong>{status.count}</strong>
              </button>
            ))}
          </div>
        </article>

      </div>
      {selectedFilter ? (
        <div className="dashboard-student-charts__active-filter" role="status">
          <span>
            Alunos exibidos abaixo: <strong>{selectedFilter.label}</strong>
          </span>
          <button type="button" onClick={() => onFilterChange(null)}>
            Limpar seleção
          </button>
        </div>
      ) : (
        <p className="muted dashboard-student-charts__select-hint">
          Selecione uma faixa ou um status para filtrar os alunos abaixo.
        </p>
      )}
    </section>
  )
}
