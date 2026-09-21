import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StudentShellView } from '../../design/layouts/StudentShellView'
import { TrilhaPlayerPageView } from '../../design/views/TrilhaPlayerPageView'
import {
  advanceWithConflictHandling,
  fetchNextContent,
  fetchTrilhaHome,
  normalizeOptions,
  submitExercise,
  TrilhaApiError,
  type TrilhaNextContent,
} from '../../lib/trilha/trilhaApi'
import {
  clearTrilhaSession,
  loadTrilhaSession,
  newIdempotencyKey,
} from '../../lib/trilha/trilhaSession'

function mapStageType(
  t: TrilhaNextContent['stage_type'],
): 'fixed' | 'exercise' | 'ai' {
  if (t === 'exercise' || t === 'ai' || t === 'fixed') return t
  return 'fixed'
}

function normalizeNextAction(
  content: TrilhaNextContent,
): TrilhaNextContent['next_action'] {
  if (content.is_released === false && content.next_action !== 'completed') {
    return 'await_release'
  }
  return content.next_action
}

export function TrilhaPlayerPage() {
  const navigate = useNavigate()
  const session = loadTrilhaSession()!

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [answerValue, setAnswerValue] = useState('')
  const [trailId, setTrailId] = useState<string | null>(null)
  const [institutionId, setInstitutionId] = useState(
    session.student.institution_id,
  )
  const [content, setContent] = useState<TrilhaNextContent | null>(null)

  const applyContent = useCallback((next: TrilhaNextContent) => {
    setContent({ ...next, next_action: normalizeNextAction(next) })
    setAnswerValue('')
    setLoadState('ready')
  }, [])

  const load = useCallback(async () => {
    setLoadState('loading')
    setErrorMessage(undefined)
    try {
      const home = await fetchTrilhaHome(session.token)
      if (!home.enrollment?.trail_id) {
        setErrorMessage('Ainda não há trilha para si.')
        setLoadState('error')
        return
      }
      setTrailId(home.enrollment.trail_id)
      setInstitutionId(
        home.enrollment.institution_id || session.student.institution_id,
      )
      const next = await fetchNextContent(
        session.student.student_id,
        home.enrollment.trail_id,
        session.token,
      )
      applyContent(next)
    } catch (e) {
      if (e instanceof TrilhaApiError && (e.status === 401 || e.status === 403)) {
        clearTrilhaSession()
        navigate('/trilha/login', {
          replace: true,
          state: { returnUrl: '/trilha/play' },
        })
        return
      }
      setErrorMessage(
        e instanceof Error ? e.message : 'Erro ao carregar o passo.',
      )
      setLoadState('error')
    }
  }, [applyContent, navigate, session.student.institution_id, session.student.student_id, session.token])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  function logout() {
    clearTrilhaSession()
    navigate('/trilha/login', { replace: true })
  }

  async function handleContinue() {
    if (!content || !trailId || submitting) return
    if (content.next_action !== 'deliver_content') return

    setSubmitting(true)
    setErrorMessage(undefined)
    setConflictMessage(null)
    const key = newIdempotencyKey(
      session.student.student_id,
      trailId,
      content.stage_number,
      content.question_number,
    )

    try {
      const outcome = await advanceWithConflictHandling({
        studentId: session.student.student_id,
        trailId,
        idempotencyKey: key,
        expectedVersion: content.progress_version,
        reason: 'delivered',
        token: session.token,
      })

      if (outcome.kind === 'conflict') {
        setConflictMessage(
          'O progresso foi atualizado noutro dispositivo. A mostrar o passo atual.',
        )
        const next = await outcome.resync()
        applyContent(next)
        return
      }

      const next = await fetchNextContent(
        session.student.student_id,
        trailId,
        session.token,
      )
      applyContent(next)
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Falha ao avançar.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitAnswer() {
    if (!content || !trailId || submitting) return
    if (content.next_action !== 'await_answer') return
    const answer = answerValue.trim()
    if (!answer) return

    setSubmitting(true)
    setErrorMessage(undefined)
    setConflictMessage(null)
    const key = newIdempotencyKey(
      session.student.student_id,
      trailId,
      content.stage_number,
      content.question_number,
    )

    try {
      try {
        await submitExercise({
          studentId: session.student.student_id,
          trailId,
          institutionId,
          stageNumber: content.stage_number,
          questionNumber: content.question_number,
          answer,
          idempotencyKey: key,
          expectedVersion: content.progress_version,
          token: session.token,
        })
      } catch (e) {
        if (e instanceof TrilhaApiError && e.isConflict) {
          setConflictMessage(
            'O progresso foi atualizado noutro dispositivo. A mostrar o passo atual.',
          )
          const next = await fetchNextContent(
            session.student.student_id,
            trailId,
            session.token,
          )
          applyContent(next)
          return
        }
        // Fallback: se submit-exercise falhar por feature gap, tentar advance após resposta
        if (
          e instanceof TrilhaApiError &&
          (e.status === 404 || e.status === 501 || e.status === 405)
        ) {
          const outcome = await advanceWithConflictHandling({
            studentId: session.student.student_id,
            trailId,
            idempotencyKey: key,
            expectedVersion: content.progress_version,
            reason: 'answered',
            token: session.token,
          })
          if (outcome.kind === 'conflict') {
            setConflictMessage(
              'O progresso foi atualizado noutro dispositivo. A mostrar o passo atual.',
            )
            const next = await outcome.resync()
            applyContent(next)
            return
          }
        } else {
          throw e
        }
      }

      const next = await fetchNextContent(
        session.student.student_id,
        trailId,
        session.token,
      )
      applyContent(next)
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Falha ao enviar resposta.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const stageType = mapStageType(content?.stage_type ?? 'fixed')
  const body =
    content?.content?.trim() ||
    content?.prompt?.trim() ||
    'Conteúdo indisponível neste passo.'

  return (
    <StudentShellView
      studentName={session.student.name || null}
      onLogout={logout}
    >
      <TrilhaPlayerPageView
        stageNumber={content?.stage_number ?? 1}
        questionNumber={content?.question_number ?? 1}
        stageType={stageType}
        title={content?.title ?? undefined}
        body={body}
        options={normalizeOptions(content?.options ?? null)}
        nextAction={content?.next_action ?? 'deliver_content'}
        submitting={submitting}
        answerValue={answerValue}
        loadState={loadState}
        errorMessage={errorMessage}
        conflictMessage={conflictMessage}
        onAnswerChange={setAnswerValue}
        onContinue={() => void handleContinue()}
        onSubmitAnswer={() => void handleSubmitAnswer()}
        onBack={() => navigate('/trilha')}
        onRetry={() => void load()}
      />
    </StudentShellView>
  )
}
