import { ProgressSummary } from '../components/trilha/ProgressSummary'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'

export type TrilhaHomePageViewProps = {
  studentName: string
  trailTitle: string
  stageNumber: number
  questionNumber: number
  progressRatio: number | null
  status: 'in_progress' | 'completed' | 'blocked' | 'not_started'
  canContinue: boolean
  whatsappHelpHref?: string
  loadState: 'loading' | 'ready' | 'empty' | 'error'
  errorMessage?: string
  onContinue: () => void
  onRetry?: () => void
}

const STATUS_LABEL: Record<TrilhaHomePageViewProps['status'], string> = {
  in_progress: 'Em progresso',
  completed: 'Concluída',
  blocked: 'Bloqueada',
  not_started: 'Não iniciada',
}

export function TrilhaHomePageView({
  studentName,
  trailTitle,
  stageNumber,
  questionNumber,
  progressRatio,
  status,
  canContinue,
  whatsappHelpHref,
  loadState,
  errorMessage,
  onContinue,
  onRetry,
}: TrilhaHomePageViewProps) {
  if (loadState === 'loading') {
    return (
      <div className="trilha-home trilha-home--skeleton" aria-busy="true">
        <div className="trilha-skeleton trilha-skeleton--title" />
        <div className="trilha-skeleton trilha-skeleton--block" />
        <div className="trilha-skeleton trilha-skeleton--cta" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="trilha-home">
        <TrilhaErrorBanner
          message={errorMessage ?? 'Não foi possível carregar a trilha.'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  if (loadState === 'empty') {
    return (
      <div className="trilha-home">
        <TrilhaEmptyState
          title="Ainda não há trilha para si."
          message="Fale com a escola para ser matriculado na trilha ativa."
        />
      </div>
    )
  }

  return (
    <div className="trilha-home">
      <p className="trilha-home__hello">Olá, {studentName}</p>
      <h1 className="trilha-home__heading">Sua trilha</h1>

      <ProgressSummary
        trailTitle={trailTitle}
        stageNumber={stageNumber}
        questionNumber={questionNumber}
        progressRatio={progressRatio}
        statusLabel={STATUS_LABEL[status]}
      />

      {status === 'completed' ? (
        <p className="banner banner--success" role="status">
          Parabéns — concluiu esta trilha.
        </p>
      ) : null}

      {canContinue ? (
        <button
          type="button"
          className="btn btn--primary trilha-cta"
          onClick={onContinue}
        >
          Continuar
        </button>
      ) : null}

      {whatsappHelpHref ? (
        <p className="trilha-home__wa">
          <a href={whatsappHelpHref} target="_blank" rel="noreferrer">
            Tirar dúvida no WhatsApp
          </a>
        </p>
      ) : null}
    </div>
  )
}
