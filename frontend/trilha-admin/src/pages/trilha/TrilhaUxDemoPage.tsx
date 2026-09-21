/**
 * DEV-only: estados fixos para screenshots UX (histórico / markdown / MCQ).
 * Não chama API — só monta as views de design com fixtures.
 */
import { StudentShellView } from '../../design/layouts/StudentShellView'
import { TrilhaHistoryPageView } from '../../design/views/TrilhaHistoryPageView'
import { TrilhaPlayerPageView } from '../../design/views/TrilhaPlayerPageView'

const noop = () => undefined

export function TrilhaUxDemoPage() {
  const params = new URLSearchParams(window.location.search)
  const scene = params.get('scene') ?? 'markdown'

  if (scene === 'history') {
    return (
      <StudentShellView studentName="Dérik" onLogout={noop}>
        <TrilhaHistoryPageView
          loadState="ready"
          onBack={noop}
          items={[
            {
              stageNumber: 1,
              questionNumber: 76,
              stageType: 'fixed',
              title: '**Contextualização**',
              body: '🗣️ *Contextualização*\n\nVamos falar de **formas geométricas** e o que já vimos.',
              studentAnswer: null,
              isCorrect: null,
            },
            {
              stageNumber: 1,
              questionNumber: 77,
              stageType: 'exercise',
              title: 'Exercício',
              body: 'Qual elemento?',
              studentAnswer: '**A**',
              isCorrect: true,
            },
          ]}
        />
      </StudentShellView>
    )
  }

  if (scene === 'mcq') {
    return (
      <StudentShellView studentName="Dérik" onLogout={noop}>
        <TrilhaPlayerPageView
          stageNumber={9}
          questionNumber={76}
          stageType="exercise"
          title="Questão 76"
          body="O segmento que une dois vértices não consecutivos de um polígono é chamado de:"
          options={[
            { key: 'A', label: 'A) Lado' },
            { key: 'B', label: 'B) Diagonal' },
            { key: 'C', label: 'C) Ângulo' },
          ]}
          nextAction="await_answer"
          submitting={false}
          answerValue="B"
          loadState="ready"
          onAnswerChange={noop}
          onContinue={noop}
          onSubmitAnswer={noop}
          onBack={noop}
          onOpenHistory={noop}
        />
      </StudentShellView>
    )
  }

  return (
    <StudentShellView studentName="Dérik" onLogout={noop}>
      <TrilhaPlayerPageView
        stageNumber={2}
        questionNumber={76}
        stageType="ai"
        title="Questão 76 IA"
        body={
          '🗣️ *Contextualização*\n\nHoje vamos revisar **formas geométricas** e *polígonos*.\n\nObserve o desenho e continue.'
        }
        options={null}
        nextAction="deliver_content"
        submitting={false}
        answerValue=""
        loadState="ready"
        onAnswerChange={noop}
        onContinue={noop}
        onSubmitAnswer={noop}
        onBack={noop}
        onOpenHistory={noop}
      />
    </StudentShellView>
  )
}
