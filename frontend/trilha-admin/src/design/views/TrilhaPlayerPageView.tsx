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
  options: string[] | null
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
}: TrilhaPlayerPageViewProps) {
  if (loadState === 'loading') {
    return (
      <div className="trilha-player trilha-player--skeleton" aria-busy="true">
        <div className="trilha-skeleton trilha-skeleton--title" />
        <div className="trilha-skeleton trilha-skeleton--block" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="trilha-player">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Voltar
        </button>
        <TrilhaErrorBanner
          message={errorMessage ?? 'Falha ao carregar o conteúdo.'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  return (
    <div className="trilha-player" aria-live="polite">
      <header className="trilha-player__chrome">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Voltar
        </button>
        <p className="trilha-player__pos">
          Etapa {stageNumber} · Questão {questionNumber}
          <span className="trilha-player__type">{TYPE_LABEL[stageType]}</span>
        </p>
      </header>

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
            title={title}
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
