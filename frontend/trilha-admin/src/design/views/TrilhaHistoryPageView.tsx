import { SafeMarkdown } from '../components/trilha/SafeMarkdown'
import { TrilhaEmptyState } from '../components/trilha/TrilhaEmptyState'
import { TrilhaErrorBanner } from '../components/trilha/TrilhaErrorBanner'

export type HistoryListItem = {
  stageNumber: number
  questionNumber: number
  stageType: 'fixed' | 'exercise' | 'ai' | null
  title: string | null
  body: string
  studentAnswer: string | null
  isCorrect: boolean | null
}

export type TrilhaHistoryPageViewProps = {
  items: HistoryListItem[]
  loadState: 'loading' | 'ready' | 'empty' | 'error'
  errorMessage?: string
  onBack: () => void
  onRetry?: () => void
}

const TYPE_LABEL: Record<'fixed' | 'exercise' | 'ai', string> = {
  fixed: 'leitura',
  exercise: 'exercício',
  ai: 'IA',
}

export function TrilhaHistoryPageView({
  items,
  loadState,
  errorMessage,
  onBack,
  onRetry,
}: TrilhaHistoryPageViewProps) {
  if (loadState === 'loading') {
    return (
      <div
        className="trilha-history trilha-history--skeleton"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="visually-hidden">A carregar o histórico…</p>
        <div className="trilha-skeleton trilha-skeleton--title" aria-hidden="true" />
        <div className="trilha-skeleton trilha-skeleton--block" aria-hidden="true" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="trilha-history">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Voltar
        </button>
        <TrilhaErrorBanner
          message={errorMessage ?? 'Falha ao carregar o histórico.'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  return (
    <div className="trilha-history">
      <header className="trilha-history__chrome">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Voltar
        </button>
      </header>
      <h1 className="trilha-history__heading">Histórico</h1>
      <p className="trilha-history__lead muted">
        Passos já concluídos — só leitura. Não é possível alterar respostas
        antigas.
      </p>

      {loadState === 'empty' || items.length === 0 ? (
        <TrilhaEmptyState
          title="Ainda sem histórico"
          message="Quando avançar na trilha, os passos concluídos aparecem aqui."
          actionLabel="Voltar à home"
          onAction={onBack}
        />
      ) : (
        <ol className="trilha-history__list">
          {items.map((item) => {
            const typeLabel =
              item.stageType && item.stageType in TYPE_LABEL
                ? TYPE_LABEL[item.stageType]
                : null
            return (
              <li
                key={`${item.stageNumber}-${item.questionNumber}`}
                className="trilha-history__item"
              >
                <header className="trilha-history__item-head">
                  <p className="trilha-history__pos">
                    Etapa {item.stageNumber} · Questão {item.questionNumber}
                    {typeLabel ? (
                      <span className="trilha-player__type">{typeLabel}</span>
                    ) : null}
                  </p>
                  {item.title ? (
                    <h2 className="trilha-history__item-title">
                      <SafeMarkdown text={item.title} inline />
                    </h2>
                  ) : null}
                </header>
                <div className="trilha-content__body trilha-history__body">
                  <SafeMarkdown text={item.body || '—'} />
                </div>
                {item.studentAnswer != null && item.studentAnswer !== '' ? (
                  <p className="trilha-history__answer" aria-label="Sua resposta">
                    <span className="trilha-history__answer-label">
                      Sua resposta:
                    </span>{' '}
                    <SafeMarkdown text={item.studentAnswer} inline />
                    {item.isCorrect === true ? (
                      <span className="trilha-history__badge trilha-history__badge--ok">
                        {' '}
                        correta
                      </span>
                    ) : item.isCorrect === false ? (
                      <span className="trilha-history__badge"> incorreta</span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
