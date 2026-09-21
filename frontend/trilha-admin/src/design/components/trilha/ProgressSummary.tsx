export type ProgressSummaryProps = {
  trailTitle: string
  stageNumber: number
  questionNumber: number
  progressRatio: number | null
  statusLabel: string
}

export function ProgressSummary({
  trailTitle,
  stageNumber,
  questionNumber,
  progressRatio,
  statusLabel,
}: ProgressSummaryProps) {
  const pct =
    progressRatio === null
      ? null
      : Math.max(0, Math.min(100, Math.round(progressRatio * 100)))

  return (
    <div className="trilha-progress">
      <p className="trilha-progress__trail">{trailTitle}</p>
      <p className="trilha-progress__pos">
        Etapa {stageNumber} · Questão {questionNumber}
        <span className="trilha-progress__status"> · {statusLabel}</span>
      </p>
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
        </div>
      ) : null}
    </div>
  )
}
