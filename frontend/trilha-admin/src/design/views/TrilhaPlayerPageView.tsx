import { AiReviewSidebar } from '../components/trilha/AiReviewSidebar'
import { ExerciseAnswerForm } from '../components/trilha/ExerciseAnswerForm'
import { StageContentBlock } from '../components/trilha/StageContentBlock'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'
import { WaSyncBadge } from '../components/trilha/WaSyncBadge'
import { unitPositionLabel } from '../../lib/trilha/trailPath'

export type TrilhaPlayerPageViewProps = {
  stageNumber: number
  questionNumber: number
  totalQuestions?: number | null
  totalStages?: number | null
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
  /** Feedback pós-exercício (Ciclo 3) — null = ainda a responder. */
  feedbackState?: 'correct' | 'incorrect' | 'recorded' | null
  victoryMessage?: string | null
  onAnswerChange: (value: string) => void
  onContinue: () => void
  onSubmitAnswer: () => void
  onContinueAfterFeedback?: () => void
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
  totalQuestions = null,
  totalStages = null,
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
  feedbackState = null,
  victoryMessage = null,
  onAnswerChange,
  onContinue,
  onSubmitAnswer,
  onContinueAfterFeedback,
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
          Voltar ao mapa
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
  const unitPos = unitPositionLabel(questionNumber, totalQuestions)
  const stagePos =
    typeof totalStages === 'number' && totalStages >= 1
      ? `Etapa ${stageNumber} de ${totalStages}`
      : `Etapa ${stageNumber}`

  const showAiReview =
    stageType === 'ai' &&
    (nextAction === 'deliver_content' || nextAction === 'await_answer')

  return (
    <div className="trilha-player trilha-player--v2">
      <WaSyncBadge />
      <header className="trilha-player__chrome">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Voltar ao mapa
        </button>
        <p className="trilha-player__pos">
          {stagePos}
          {unitPos ? ` · ${unitPos}` : ` · Questão ${questionNumber}`}
          {nextAction === 'deliver_content' || nextAction === 'await_answer' ? (
            <span className="trilha-player__type">{TYPE_LABEL[stageType]}</span>
          ) : nextAction === 'await_release' ? (
            <span className="trilha-player__type">pausado</span>
          ) : null}
        </p>
        {onOpenHistory ? (
          <button
            type="button"
            className="btn btn--ghost btn--small trilha-player__history"
            onClick={onOpenHistory}
          >
            Revisão
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
          title="Pausa — aguardando liberação"
          message="O próximo conteúdo ainda não foi liberado. O seu progresso está seguro. Volte mais tarde ou fale com a escola."
          actionLabel="Voltar ao mapa"
          onAction={onBack}
        />
      ) : null}

      {nextAction === 'completed' ? (
        <TrilhaEmptyState
          title="Trilha concluída"
          message="Parabéns — concluiu esta trilha."
          actionLabel="Voltar ao mapa"
          onAction={onBack}
        />
      ) : null}

      {victoryMessage ? (
        <p className="trilha-player__victory banner banner--success" role="status" aria-live="polite">
          {victoryMessage}
        </p>
      ) : null}

      {(nextAction === 'deliver_content' || nextAction === 'await_answer') && (
        <div
          className={
            showAiReview
              ? 'trilha-lesson-layout trilha-lesson-layout--ai'
              : 'trilha-lesson-layout'
          }
        >
          <div className="trilha-lesson-layout__main">
            <div className="trilha-player__step-pane" key={`${stageNumber}-${questionNumber}-${feedbackState ?? 'ans'}`}>
              <StageContentBlock
                body={body}
                stageType={stageType}
                aiHint={stageType === 'ai'}
              />
            </div>

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
                <p className="trilha-player__safe muted">
                  Pode sair; o progresso fica guardado.
                </p>
              </div>
            ) : feedbackState ? (
              <div className="trilha-player__feedback" role="status" aria-live="polite">
                <p
                  className={
                    feedbackState === 'correct'
                      ? 'trilha-player__feedback-msg trilha-player__feedback-msg--ok'
                      : 'trilha-player__feedback-msg'
                  }
                >
                  {feedbackState === 'correct'
                    ? 'Boa! Resposta correta.'
                    : feedbackState === 'incorrect'
                      ? 'Ainda não — mas o progresso segue. Pode rever depois na Revisão.'
                      : 'Resposta registada. Pode seguir para o próximo passo.'}
                </p>
                <button
                  type="button"
                  className="btn btn--primary trilha-cta"
                  onClick={onContinueAfterFeedback ?? onContinue}
                >
                  Próximo passo
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
          </div>

          {showAiReview ? (
            <>
              <details className="trilha-ai-review-mobile">
                <summary>Revisão com IA</summary>
                <AiReviewSidebar onOpenHistory={onOpenHistory} />
              </details>
              <div className="trilha-lesson-layout__aside">
                <AiReviewSidebar onOpenHistory={onOpenHistory} />
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
