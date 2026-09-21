import { useEffect } from 'react'
import { ProgressSummary } from '../components/trilha/ProgressSummary'
import { TrailPathMap } from '../components/trilha/TrailPathMap'
import { UnitMap } from '../components/trilha/UnitMap'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'
import {
  buildTrailPathNodes,
  nowFocusCopy,
  sessionEffortHint,
} from '../../lib/trilha/trailPath'
import {
  buildUnitSections,
  type HistoryStepHint,
} from '../../lib/trilha/unitMap'
import type { HomeNextAction } from '../../lib/trilha/homeCta'

export type TrilhaHomePageViewProps = {
  studentName: string
  trailTitle: string
  stageNumber: number
  questionNumber: number
  progressRatio: number | null
  totalStages?: number | null
  totalQuestions?: number | null
  stageType?: 'fixed' | 'exercise' | 'ai' | null
  statusLabel: string
  /** Estado pedagógico alinhado a next_action (sem CTA). */
  homeHint?: 'await_release' | 'blocked' | 'completed' | null
  nextAction?: HomeNextAction | null
  canContinue: boolean
  historyHints?: HistoryStepHint[]
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
  totalStages = null,
  totalQuestions = null,
  stageType = null,
  statusLabel,
  homeHint = null,
  nextAction = null,
  canContinue,
  historyHints = [],
  whatsappHelpHref,
  loadState,
  errorMessage,
  onContinue,
  onOpenHistory,
  onRetry,
}: TrilhaHomePageViewProps) {
  useEffect(() => {
    if (loadState !== 'ready') return
    const el =
      document.getElementById('trilha-unit-current') ??
      document.getElementById('trilha-path-current')
    if (!el || typeof el.scrollIntoView !== 'function') return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [loadState, stageNumber, questionNumber, homeHint])

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

  const focus = nowFocusCopy(
    nextAction ?? homeHint,
    stageNumber,
    questionNumber,
    stageType,
  )
  const effort = sessionEffortHint(nextAction ?? homeHint, stageType)
  const pathNodes = buildTrailPathNodes(stageNumber, totalStages ?? null, {
    completed: homeHint === 'completed',
    paused: homeHint === 'await_release',
    compact: true,
  })
  const hasFullTrail =
    typeof totalStages === 'number' &&
    Number.isFinite(totalStages) &&
    totalStages >= 1
  const unitSections = buildUnitSections({
    currentStage: stageNumber,
    currentQuestion: questionNumber,
    totalStages: totalStages ?? null,
    totalQuestions: totalQuestions ?? null,
    currentStageType: stageType,
    paused: homeHint === 'await_release',
    completed: homeHint === 'completed',
    history: historyHints,
  })

  return (
    <div className="trilha-home">
      <p className="trilha-home__hello">Olá, {studentName}</p>
      <p className="trilha-home__brand-label">Trilha</p>
      <h1 className="trilha-home__heading">{trailTitle || 'Sua trilha'}</h1>
      <p className="trilha-home__sync muted">
        O progresso é o mesmo do WhatsApp.
      </p>

      <ProgressSummary
        trailTitle={trailTitle}
        stageNumber={stageNumber}
        questionNumber={questionNumber}
        progressRatio={progressRatio}
        statusLabel={statusLabel}
        totalStages={totalStages}
      />

      <TrailPathMap nodes={pathNodes} hasFullTrail={hasFullTrail} />

      <section className="trilha-home__now" aria-labelledby="trilha-now-title">
        <h2 id="trilha-now-title" className="trilha-home__section-title">
          {focus.title}
        </h2>
        <p className="trilha-home__now-detail">{focus.detail}</p>
        {effort ? (
          <p className="trilha-home__effort muted">{effort}</p>
        ) : null}

        {homeHint === 'completed' ? (
          <p className="banner banner--success" role="status">
            Parabéns — concluiu esta trilha.
          </p>
        ) : null}

        {homeHint === 'await_release' ? (
          <TrilhaEmptyState
            title="Pausa esperada"
            message="O próximo conteúdo ainda não foi liberado. O seu progresso está seguro — volte mais tarde ou fale com a escola."
          />
        ) : null}

        {homeHint === 'blocked' ? (
          <TrilhaEmptyState
            title="Trilha pausada"
            message="Não é possível continuar neste momento. Fale com a escola."
          />
        ) : null}

        {canContinue && focus.cta ? (
          <button
            type="button"
            className="btn btn--primary trilha-cta"
            onClick={onContinue}
          >
            {focus.cta}
          </button>
        ) : null}

        {homeHint === 'completed' && onOpenHistory ? (
          <button
            type="button"
            className="btn btn--primary trilha-cta"
            onClick={onOpenHistory}
          >
            Revisar o que aprendeu
          </button>
        ) : null}
      </section>

      <UnitMap sections={unitSections} />

      {onOpenHistory && homeHint !== 'completed' ? (
        <section
          className="trilha-home__review"
          aria-labelledby="trilha-review-title"
        >
          <h2 id="trilha-review-title" className="trilha-home__section-title">
            Revisar o que aprendeu
          </h2>
          <p className="trilha-home__review-detail muted">
            Veja passos concluídos e respostas — só leitura, sem alterar o
            progresso.
          </p>
          <button
            type="button"
            className="btn btn--ghost trilha-home__history"
            onClick={onOpenHistory}
          >
            Abrir revisão
          </button>
        </section>
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
