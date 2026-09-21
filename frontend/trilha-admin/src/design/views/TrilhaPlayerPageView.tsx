import { ExerciseAnswerForm } from '../components/trilha/ExerciseAnswerForm'
import { StageContentBlock } from '../components/trilha/StageContentBlock'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'

export type TrilhaPlayerPageViewProps = {
  stageNumber: number
  questionNumber: number
  stageType: 'fixed' | 'exercise' | 'ai'
  title?: string
  body: string
  options: { key: string; label: string }[] | null
  nextAction:
    | 'deliver_content'
    | 'await_answer'
    | 'await_release'
    | 'blocked'
    | 'completed'
  submitting: boolean
  answerValue: string
  loadState: 'loading' | 'ready' | 'error'
  errorMessage?: string
  conflictMessage?: string | null
  onAnswerChange: (value: string) => void
  onContinue: () => void
  onSubmitAnswer: () => void
  onBack: () => void
  onRetry?: () => void
  onOpenHistory?: () => void
}

const TYPE_LABEL: Record<'fixed' | 'exercise' | 'ai', string> = {
  fixed: 'leitura',
  exercise: 'exercício',
  ai: 'IA',
}

export function TrilhaPlayerPageView({
  stageNumber,
  questionNumber,
  stageType,
  title,
  body,
  options,
  nextAction,
  submitting,
  answerValue,
  loadState,
  errorMessage,
  conflictMessage,
  onAnswerChange,
  onContinue,
  onSubmitAnswer,
  onBack,
  onRetry,
  onOpenHistory,
}: TrilhaPlayerPageViewProps) {
  if (loadState === 'loading') {
    return (
      <div
        className="trilha-player trilha-player--skeleton"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="visually-hidden">A carregar o passo da trilha…</p>
        <div className="trilha-skeleton trilha-skeleton--title" aria-hidden="true" />
        <div className="trilha-skeleton trilha-skeleton--block" aria-hidden="true" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="trilha-player">
        <h1 className="visually-hidden">Player da trilha</h1>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Voltar
        </button>
        <TrilhaErrorBanner
          message={errorMessage ?? 'Falha ao carregar o conteúdo.'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  const hasTitle = Boolean(title?.trim())
  const heading = hasTitle
    ? title!.trim()
    : `Etapa ${stageNumber}, questão ${questionNumber}`

  return (
    <div className="trilha-player">
      <header className="trilha-player__chrome">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Voltar
        </button>
        <p className="trilha-player__pos">
          Etapa {stageNumber} · Questão {questionNumber}
          {nextAction === 'deliver_content' || nextAction === 'await_answer' ? (
            <span className="trilha-player__type">{TYPE_LABEL[stageType]}</span>
          ) : nextAction === 'await_release' ? (
            <span className="trilha-player__type">aguardando</span>
          ) : null}
        </p>
        {onOpenHistory ? (
          <button
            type="button"
            className="btn btn--ghost btn--small trilha-player__history"
            onClick={onOpenHistory}
          >
            Histórico
          </button>
        ) : null}
      </header>
      <h1
        className={hasTitle ? 'trilha-player__heading' : 'visually-hidden'}
      >
        {heading}
      </h1>

      {conflictMessage ? (
        <p className="banner banner--info" role="status">
          {conflictMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <TrilhaErrorBanner message={errorMessage} onRetry={onRetry} />
      ) : null}

      {nextAction === 'await_release' || nextAction === 'blocked' ? (
        <TrilhaEmptyState
          title="Ainda não liberado"
          message="O próximo conteúdo ainda não foi liberado. Volte mais tarde ou fale com a escola."
          actionLabel="Voltar à home"
          onAction={onBack}
        />
      ) : null}

      {nextAction === 'completed' ? (
        <TrilhaEmptyState
          title="Trilha concluída"
          message="Parabéns — concluiu esta trilha."
          actionLabel="Voltar à home"
          onAction={onBack}
        />
      ) : null}

      {(nextAction === 'deliver_content' || nextAction === 'await_answer') && (
        <>
          <StageContentBlock
            body={body}
            stageType={stageType}
            aiHint={stageType === 'ai'}
          />

          {nextAction === 'deliver_content' ? (
            <div className="trilha-player__actions">
              <button
                type="button"
                className="btn btn--primary trilha-cta"
                disabled={submitting}
                aria-busy={submitting || undefined}
                onClick={onContinue}
              >
                {submitting ? 'A guardar…' : 'Continuar'}
              </button>
            </div>
          ) : (
            <ExerciseAnswerForm
              options={options}
              value={answerValue}
              submitting={submitting}
              onChange={onAnswerChange}
              onSubmit={onSubmitAnswer}
            />
          )}
        </>
      )}
    </div>
  )
}
