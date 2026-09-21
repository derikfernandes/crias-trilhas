import { ProgressSummary } from '../components/trilha/ProgressSummary'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'

export type TrilhaHomePageViewProps = {
  studentName: string
  trailTitle: string
  stageNumber: number
  questionNumber: number
  progressRatio: number | null
  statusLabel: string
  /** Estado pedagógico alinhado a next_action (sem CTA). */
  homeHint?: 'await_release' | 'blocked' | 'completed' | null
  canContinue: boolean
  whatsappHelpHref?: string
  loadState: 'loading' | 'ready' | 'empty' | 'error'
  errorMessage?: string
  onContinue: () => void
  onOpenHistory?: () => void
  onRetry?: () => void
}

export function TrilhaHomePageView({
  studentName,
  trailTitle,
  stageNumber,
  questionNumber,
  progressRatio,
  statusLabel,
  homeHint = null,
  canContinue,
  whatsappHelpHref,
  loadState,
  errorMessage,
  onContinue,
  onOpenHistory,
  onRetry,
}: TrilhaHomePageViewProps) {
  if (loadState === 'loading') {
    return (
      <div
        className="trilha-home trilha-home--skeleton"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="visually-hidden">A carregar a sua trilha…</p>
        <div className="trilha-skeleton trilha-skeleton--title" aria-hidden="true" />
        <div className="trilha-skeleton trilha-skeleton--block" aria-hidden="true" />
        <div className="trilha-skeleton trilha-skeleton--cta" aria-hidden="true" />
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
        statusLabel={statusLabel}
      />

      {homeHint === 'completed' ? (
        <p className="banner banner--success" role="status">
          Parabéns — concluiu esta trilha.
        </p>
      ) : null}

      {homeHint === 'await_release' ? (
        <TrilhaEmptyState
          title="Ainda não liberado"
          message="O próximo conteúdo ainda não foi liberado. Volte mais tarde ou fale com a escola."
        />
      ) : null}

      {homeHint === 'blocked' ? (
        <TrilhaEmptyState
          title="Trilha bloqueada"
          message="Não é possível continuar neste momento. Fale com a escola."
        />
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

      {onOpenHistory ? (
        <button
          type="button"
          className="btn btn--ghost trilha-home__history"
          onClick={onOpenHistory}
        >
          Ver histórico
        </button>
      ) : null}

      {whatsappHelpHref ? (
        <p className="trilha-home__wa">
          <a
            href={whatsappHelpHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Tirar dúvida no WhatsApp (abre numa nova janela)"
          >
            Tirar dúvida no WhatsApp
            <span className="visually-hidden"> (abre numa nova janela)</span>
          </a>
        </p>
      ) : null}
    </div>
  )
}
