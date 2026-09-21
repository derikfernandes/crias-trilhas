export type ProgressSummaryProps = {
  trailTitle: string
  stageNumber: number
  questionNumber: number
  progressRatio: number | null
  statusLabel: string
  totalStages?: number | null
  /** Resumo curto do que já foi feito (derivado do cursor). */
  doneSummary?: string | null
}

export function ProgressSummary({
  trailTitle,
  stageNumber,
  questionNumber,
  progressRatio,
  statusLabel,
  totalStages = null,
  doneSummary = null,
}: ProgressSummaryProps) {
  const pct =
    progressRatio === null
      ? null
      : Math.max(0, Math.min(100, Math.round(progressRatio * 100)))

  const stagesDone = Math.max(0, stageNumber - 1)
  const doneText =
    doneSummary ??
    (stagesDone === 0
      ? 'Ainda no começo — nenhuma etapa concluída.'
      : typeof totalStages === 'number' && totalStages > 0
        ? `${stagesDone} de ${totalStages} etapas concluídas.`
        : `${stagesDone} etapa${stagesDone === 1 ? '' : 's'} concluída${stagesDone === 1 ? '' : 's'}.`)

  return (
    <div className="trilha-progress">
      <p className="trilha-progress__trail">{trailTitle}</p>
      <dl className="trilha-progress__glance">
        <div className="trilha-progress__glance-item">
          <dt>Já fez</dt>
          <dd>{doneText}</dd>
        </div>
        <div className="trilha-progress__glance-item">
          <dt>Agora</dt>
          <dd>
            Etapa {stageNumber} · Questão {questionNumber}
            <span className="trilha-progress__status"> · {statusLabel}</span>
          </dd>
        </div>
      </dl>
      {pct !== null ? (
        <div
          className="trilha-progress__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Progresso estimado na trilha"
        >
          <div
            className="trilha-progress__bar-fill"
            style={{ width: `${pct}%` }}
          />
          <span className="trilha-progress__pct" aria-hidden="true">
            {pct}%
          </span>
        </div>
      ) : null}
    </div>
  )
}
