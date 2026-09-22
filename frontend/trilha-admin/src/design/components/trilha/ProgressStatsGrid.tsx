export type ProgressStatsGridProps = {
  progressPct: number | null
  stagesDone: number
  totalStages: number | null
  totalQuestions: number | null
  stageNumber: number
  questionNumber: number
  habitLine?: string | null
  completed?: boolean
}

export function ProgressStatsGrid({
  progressPct,
  stagesDone,
  totalStages,
  totalQuestions,
  stageNumber,
  questionNumber,
  habitLine = null,
  completed = false,
}: ProgressStatsGridProps) {
  const pctLabel =
    progressPct === null ? '—' : `${Math.round(progressPct * 100)}%`
  /** I-MAP-3: etapas = fases (`total_stages`), não aulas. */
  const stagesLabel =
    totalStages != null && totalStages > 0
      ? `${completed ? totalStages : stagesDone}/${totalStages}`
      : `${stagesDone}`
  const aulaLabel =
    totalQuestions != null && totalQuestions > 0
      ? `${questionNumber}/${totalQuestions}`
      : `${questionNumber}`
  /** I-MAP-1: par do cursor Firebase. */
  const nowLabel = completed
    ? 'Concluída'
    : `Etapa ${stageNumber} · Q${questionNumber}`

  return (
    <div className="trilha-stats" aria-label="Resumo do progresso">
      <div className="trilha-stats__grid">
        <div className="trilha-stats__cell">
          <span className="trilha-stats__value">{pctLabel}</span>
          <span className="trilha-stats__label">Progresso</span>
        </div>
        <div className="trilha-stats__cell">
          <span className="trilha-stats__value">{stagesLabel}</span>
          <span className="trilha-stats__label">Fases</span>
        </div>
        <div className="trilha-stats__cell">
          <span className="trilha-stats__value">{aulaLabel}</span>
          <span className="trilha-stats__label">Aula</span>
        </div>
        <div className="trilha-stats__cell trilha-stats__cell--wide">
          <span className="trilha-stats__value trilha-stats__value--now">
            {nowLabel}
          </span>
          <span className="trilha-stats__label">Cursor</span>
        </div>
        <div className="trilha-stats__cell">
          <span className="trilha-stats__value trilha-stats__value--habit">
            {habitLine ? '●' : '—'}
          </span>
          <span className="trilha-stats__label">Ritmo</span>
        </div>
      </div>
      {habitLine ? (
        <p className="trilha-stats__habit muted">{habitLine}</p>
      ) : null}
    </div>
  )
}
