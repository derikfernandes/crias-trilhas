import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StudentShellView } from '../../design/layouts/StudentShellView'
import { TrilhaHomePageView } from '../../design/views/TrilhaHomePageView'
import {
  homeCanContinue,
  homeStatusLabel,
  type HomeNextAction,
} from '../../lib/trilha/homeCta'
import { fetchTrilhaHome, TrilhaApiError } from '../../lib/trilha/trilhaApi'
import {
  clearTrilhaSession,
  loadTrilhaSession,
} from '../../lib/trilha/trilhaSession'

const WA_HELP =
  'https://wa.me/5512974085258?text=' +
  encodeURIComponent('Olá! Preciso de ajuda com a Trilha Crias.')

function deriveHomeHint(
  nextAction: HomeNextAction | null,
  status: 'in_progress' | 'completed' | 'blocked' | 'not_started',
): 'await_release' | 'blocked' | 'completed' | null {
  if (nextAction === 'await_release') return 'await_release'
  if (nextAction === 'blocked' || status === 'blocked') return 'blocked'
  if (nextAction === 'completed' || status === 'completed') return 'completed'
  return null
}

export function TrilhaHomePage() {
  const navigate = useNavigate()
  const session = loadTrilhaSession()!

  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'empty' | 'error'
  >('loading')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [trailTitle, setTrailTitle] = useState('')
  const [stageNumber, setStageNumber] = useState(1)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [progressRatio, setProgressRatio] = useState<number | null>(null)
  const [status, setStatus] = useState<
    'in_progress' | 'completed' | 'blocked' | 'not_started'
  >('not_started')
  const [nextAction, setNextAction] = useState<HomeNextAction | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    setErrorMessage(undefined)
    try {
      const home = await fetchTrilhaHome(session.token)
      if (!home.enrollment || !home.trail) {
        setNextAction(null)
        setProgressRatio(null)
        setLoadState('empty')
        return
      }
      setTrailTitle(home.trail.title)
      setStageNumber(home.enrollment.current_stage_number)
      setQuestionNumber(home.enrollment.current_question_number)
      setProgressRatio(
        typeof home.progress_ratio === 'number' &&
          Number.isFinite(home.progress_ratio)
          ? home.progress_ratio
          : null,
      )
      const st = home.enrollment.progress_status
      if (
        st === 'in_progress' ||
        st === 'completed' ||
        st === 'blocked' ||
        st === 'not_started'
      ) {
        setStatus(st)
      } else {
        setStatus('in_progress')
      }
      const action = home.next_action
      if (
        action === 'deliver_content' ||
        action === 'await_answer' ||
        action === 'await_release' ||
        action === 'blocked' ||
        action === 'completed'
      ) {
        setNextAction(action)
      } else {
        setNextAction(null)
      }
      setLoadState('ready')
    } catch (e) {
      if (e instanceof TrilhaApiError && (e.status === 401 || e.status === 403)) {
        clearTrilhaSession()
        navigate('/trilha/login', { replace: true })
        return
      }
      setErrorMessage(
        e instanceof Error ? e.message : 'Erro ao carregar a home.',
      )
      setLoadState('error')
    }
  }, [navigate, session.token])

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

  const canContinue = loadState === 'ready' && homeCanContinue(nextAction)
  const homeHint = deriveHomeHint(nextAction, status)

  return (
    <StudentShellView
      studentName={session.student.name || null}
      onLogout={logout}
    >
      <TrilhaHomePageView
        studentName={session.student.name || 'aluno'}
        trailTitle={trailTitle}
        stageNumber={stageNumber}
        questionNumber={questionNumber}
        progressRatio={progressRatio}
        statusLabel={homeStatusLabel(status, nextAction)}
        homeHint={homeHint}
        canContinue={canContinue}
        whatsappHelpHref={WA_HELP}
        loadState={loadState}
        errorMessage={errorMessage}
        onContinue={() => navigate('/trilha/play')}
        onRetry={() => void load()}
      />
    </StudentShellView>
  )
}
