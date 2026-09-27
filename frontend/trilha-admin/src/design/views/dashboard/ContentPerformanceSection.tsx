import type {
  DashboardContentBarView,
  DashboardContentSummaryView,
} from '../../types/dashboardPageView'
import { formatPct } from './formatPct'
import { IconTarget, IconTrendUp } from '../../components/icons/KpiIcons'

export type ContentPerformanceSectionProps = {
  summary: DashboardContentSummaryView
  bars: DashboardContentBarView[]
  selectedKey: string | null
  onSelectKey: (key: string | null) => void
}

function IconAlertLocal() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function IconTrophyLocal() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

export function ContentPerformanceSection({
  summary,
  bars,
  selectedKey,
  onSelectKey,
}: ContentPerformanceSectionProps) {
  if (bars.length === 0) return null
  const selected = bars.find((b) => b.key === selectedKey) ?? null

  return (
    <section className="crias-content" aria-label="Como a turma está em cada conteúdo">
      <div className="crias-content__head">
        <div>
          <div className="crias-label">
            Conteúdos · {summary.releasedCount} de {summary.totalCount} liberados
          </div>
          <h2 className="crias-section-title" style={{ borderBottom: 0, paddingBottom: 0 }}>
            Como a turma está em cada conteúdo
          </h2>
        </div>
      </div>

      <div className="crias-content__sum">
        <div className="crias-content__sum-item">
          <span className="crias-content__sum-label">
            <span className="crias-kpi__icon">
              <IconTrendUp />
            </span>
            Progresso médio
          </span>
          <span className="crias-content__sum-value">
            {formatPct(summary.progressAvg, 0)}
          </span>
          <span className="crias-content__sum-note">
            {summary.releasedCount} de {summary.totalCount} conteúdos liberados
          </span>
        </div>
        <div className="crias-content__sum-item">
          <span className="crias-content__sum-label">
            <span className="crias-kpi__icon">
              <IconTarget />
            </span>
            Acerto médio
          </span>
          <span
            className="crias-content__sum-value"
            style={{
              color:
                summary.accuracyAvg != null && summary.accuracyAvg < 60
                  ? 'var(--c-rose-900)'
                  : undefined,
            }}
          >
            {formatPct(summary.accuracyAvg, 0)}
          </span>
          <span className="crias-content__sum-note">
            {summary.below60Count} exercícios abaixo de 60%
          </span>
        </div>
        <div className="crias-content__sum-item">
          <span className="crias-content__sum-label">
            <span className="crias-kpi__icon crias-kpi__icon--rose">
              <IconAlertLocal />
            </span>
            Conteúdo com menor acerto
          </span>
          <span
            className="crias-content__sum-value"
            style={{ color: 'var(--c-rose-900)' }}
          >
            {summary.lowest ? `${Math.round(summary.lowest.pct)}%` : '—'}
          </span>
          <span className="crias-content__sum-note">
            <strong>{summary.lowest?.label ?? ''}</strong>
          </span>
        </div>
        <div className="crias-content__sum-item">
          <span className="crias-content__sum-label">
            <span className="crias-kpi__icon crias-kpi__icon--green">
              <IconTrophyLocal />
            </span>
            Conteúdo com maior acerto
          </span>
          <span
            className="crias-content__sum-value"
            style={{ color: 'var(--c-green-800)' }}
          >
            {summary.highest ? `${Math.round(summary.highest.pct)}%` : '—'}
          </span>
          <span className="crias-content__sum-note">
            <strong>{summary.highest?.label ?? ''}</strong>
          </span>
        </div>
      </div>

      <div className="crias-content__chart">
        <div className="crias-content__legend">
          <span>
            <i style={{ background: 'var(--c-green)' }} /> Concluíram
          </span>
          <span>
            <i style={{ background: 'var(--c-text)' }} /> Acerto
          </span>
          <span className="crias-content__legend-muted">
            <i className="crias-content__dash" /> 60% de acerto
          </span>
          <span className="crias-content__legend-hint">
            Clique na coluna para detalhar
          </span>
        </div>
        <div
          className="crias-content__bars"
          style={{
            gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
          }}
        >
          {bars.map((bar) => {
            const open = selectedKey === bar.key
            const ch = bar.completionPct ?? 0
            const ah = bar.accuracyPct ?? 0
            const low = bar.accuracyPct != null && bar.accuracyPct < 60
            return (
              <button
                key={bar.key}
                type="button"
                className={
                  open
                    ? 'crias-content__col crias-content__col--open'
                    : 'crias-content__col'
                }
                disabled={!bar.released}
                aria-pressed={open}
                aria-label={`Conteúdo ${bar.num}, ${bar.title}`}
                onClick={() =>
                  onSelectKey(open || !bar.released ? null : bar.key)
                }
              >
                <span
                  className="crias-content__bar crias-content__bar--comp"
                  style={{ height: `${Math.max(0, Math.min(100, ch))}%` }}
                />
                <span
                  className="crias-content__bar crias-content__bar--acc"
                  style={{
                    height: `${Math.max(0, Math.min(100, ah))}%`,
                    background: low ? '#d9546b' : 'var(--c-text)',
                  }}
                />
              </button>
            )
          })}
        </div>
        <div
          className="crias-content__nums"
          style={{
            gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
          }}
        >
          {bars.map((bar) => (
            <span
              key={bar.key}
              className={
                selectedKey === bar.key
                  ? 'crias-content__num crias-content__num--on'
                  : 'crias-content__num'
              }
            >
              {bar.num}
            </span>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="crias-content__detail">
          <div className="crias-content__detail-head">
            <span className="crias-content__detail-tag">
              Conteúdo {selected.num}
            </span>
            <strong>{selected.title}</strong>
            <span className="muted">
              {formatPct(selected.completionPct, 0)} concluíram ·{' '}
              {formatPct(selected.accuracyPct, 0)} de acerto ·{' '}
              {selected.completedCount}/{selected.enrolledCount} alunos
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
