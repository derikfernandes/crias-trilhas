import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { snapshotToTrail, TRAILS_COLLECTION } from '../lib/trailFirestore'
import {
  TRAIL_STAGES_COLLECTION,
  snapshotToTrailStage,
  trailStageDocId,
} from '../lib/trailStageFirestore'
import {
  TRAIL_STAGE_QUESTIONS_COLLECTION,
  formatTrailStageQuestionTs,
  snapshotToTrailStageQuestion,
} from '../lib/trailStageQuestionFirestore'
import { trailPath, trailStageQuestionsPath } from '../lib/paths'
import { TrailStageQuestionForm } from '../components/TrailStageQuestionForm'
import type { Trail } from '../types/trail'
import type { TrailStage } from '../types/trailStage'
import type { TrailStageQuestion } from '../types/trailStageQuestion'

export function TrailStageQuestionsPage() {
  const { trailId, stageNumber: stageNumberParam } = useParams<{
    trailId: string
    stageNumber: string
  }>()

  const stageNumber = useMemo(() => {
    if (!stageNumberParam) return NaN
    const n = Number.parseInt(stageNumberParam, 10)
    return Number.isFinite(n) && n >= 1 ? n : NaN
  }, [stageNumberParam])

  const [trail, setTrail] = useState<Trail | null>(null)
  const [trailError, setTrailError] = useState<string | null>(null)
  const [loadingTrail, setLoadingTrail] = useState(true)

  const [trailStage, setTrailStage] = useState<TrailStage | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [loadingStage, setLoadingStage] = useState(true)

  const [questions, setQuestions] = useState<TrailStageQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [questionsError, setQuestionsError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editDocId, setEditDocId] = useState<string | null>(null)

  const editing = useMemo(() => {
    if (!editDocId) return null
    return questions.find((q) => q.id === editDocId) ?? null
  }, [editDocId, questions])

  const suggestedNextQuestionNumber = useMemo(() => {
    if (questions.length === 0) return 1
    const max = Math.max(...questions.map((q) => q.question_number))
    return max + 1
  }, [questions])

  useEffect(() => {
    if (!db || !trailId) return

    const unsub = onSnapshot(
      doc(db, TRAILS_COLLECTION, trailId),
      (snap) => {
        if (!snap.exists()) {
          setTrail(null)
          setTrailError(null)
          setLoadingTrail(false)
          return
        }
        setTrail(snapshotToTrail(snap))
        setTrailError(null)
        setLoadingTrail(false)
      },
      (err) => {
        setTrailError(err.message)
        setLoadingTrail(false)
      },
    )
    return () => unsub()
  }, [trailId])

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db || !trailId || !Number.isFinite(stageNumber)) return

      const stageDoc = trailStageDocId(trailId, stageNumber)
      setLoadingStage(true)
      setStageError(null)

      unsub = onSnapshot(
        doc(db, TRAIL_STAGES_COLLECTION, stageDoc),
        (snap) => {
          if (!snap.exists()) {
            setTrailStage(null)
            setStageError(null)
            setLoadingStage(false)
            return
          }
          setTrailStage(snapshotToTrailStage(snap))
          setStageError(null)
          setLoadingStage(false)
        },
        (err) => {
          setStageError(err.message)
          setTrailStage(null)
          setLoadingStage(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [trailId, stageNumber])

  useEffect(() => {
    if (!db || !trailId || !Number.isFinite(stageNumber)) return
    const dbOk = db
    let unsub: (() => void) | null = null

    async function run() {
      setLoadingQuestions(true)
      setQuestionsError(null)

      const q = query(
        collection(dbOk, TRAIL_STAGE_QUESTIONS_COLLECTION),
        where('trail_id', '==', trailId),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs
            .map(snapshotToTrailStageQuestion)
            .filter((item) => item.stage_number === stageNumber)
          next.sort((a, b) => a.question_number - b.question_number)
          setQuestions(next)
          setQuestionsError(null)
          setLoadingQuestions(false)
        },
        (err) => {
          setQuestionsError(err.message)
          setLoadingQuestions(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [trailId, stageNumber])

  if (!trailId) {
    return (
      <p className="banner banner--error" role="alert">
        ID da trilha ausente na URL.
      </p>
    )
  }

  if (!Number.isFinite(stageNumber)) {
    return (
      <p className="banner banner--error" role="alert">
        Número de stage inválido na URL.
      </p>
    )
  }

  const trailTitle = trail?.name?.trim() || trailId
  const listPath = trailStageQuestionsPath(trailId, stageNumber)

  return (
    <>
      <header className="admin__header">
        <h1>Questões do stage</h1>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to={trailPath(trailId)}>
            ← Trilha: {trailTitle}
          </Link>
        </p>
      </header>

      {trailError ? (
        <p className="banner banner--error" role="alert">
          {trailError}
        </p>
      ) : null}

      {loadingTrail ? (
        <p className="muted">Carregando trilha…</p>
      ) : !trail ? (
        <p className="banner banner--error" role="alert">
          Trilha não encontrada.
        </p>
      ) : (
        <p className="admin__lede muted">
          Trilha <strong>{trail.name || trailId}</strong> · stage{' '}
          <strong>{stageNumber}</strong>
          {trailStage ? (
            <>
              {' '}
              · comportamento: <code>stage_type={trailStage.stage_type}</code>
              {trailStage.stage_type === 'ai' ? (
                <>
                  {' '}
                  (prompt no stage: {trailStage.prompt ? 'definido' : 'ausente'})
                </>
              ) : null}
            </>
          ) : null}
          <br />
          <span>
            Collection conteúdo: <code>trail_stage_questions</code> — sem{' '}
            <code>question_type</code> nem <code>prompt</code>.
          </span>
        </p>
      )}

      {stageError ? (
        <p className="banner banner--error" role="alert">
          {stageError}
        </p>
      ) : null}

      {loadingStage ? (
        <p className="muted">Carregando stage…</p>
      ) : !trailStage ? (
        <p className="banner banner--error" role="alert">
          Stage não encontrado. Cadastre-o na trilha antes das questões.
        </p>
      ) : (
        <section className="panel">
          <div className="panel__head">
            <h2>Etapas e exercícios (conteúdo)</h2>
            <p className="panel__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setEditDocId(null)
                  setShowForm(true)
                }}
              >
                + Nova questão
              </button>
            </p>
          </div>

          {showForm && trailStage ? (
            editDocId ? (
              editing ? (
                <TrailStageQuestionForm
                  trailId={trailId}
                  stageNumber={stageNumber}
                  stageType={trailStage.stage_type}
                  docId={editDocId}
                  initial={editing}
                  suggestedQuestionNumber={suggestedNextQuestionNumber}
                  onCancel={() => {
                    setShowForm(false)
                    setEditDocId(null)
                  }}
                  onSaved={() => {
                    setShowForm(false)
                    setEditDocId(null)
                  }}
                />
              ) : (
                <p className="muted">Carregando questão…</p>
              )
            ) : (
              <TrailStageQuestionForm
                trailId={trailId}
                stageNumber={stageNumber}
                stageType={trailStage.stage_type}
                suggestedQuestionNumber={suggestedNextQuestionNumber}
                onCancel={() => setShowForm(false)}
                onSaved={() => setShowForm(false)}
              />
            )
          ) : null}

          {loadingQuestions ? (
            <p className="muted">Carregando questões…</p>
          ) : questionsError ? (
            <p className="banner banner--error" role="alert">
              {questionsError}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Título</th>
                    <th>Ativa</th>
                    <th>Atualizado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {questions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted table__empty">
                        Nenhuma questão neste stage. Link direto desta tela:{' '}
                        <code>{listPath}</code>
                      </td>
                    </tr>
                  ) : (
                    questions.map((q) => (
                      <tr key={q.id}>
                        <td>{q.question_number}</td>
                        <td>{q.title || '—'}</td>
                        <td>{q.active ? 'Sim' : 'Não'}</td>
                        <td>
                          {formatTrailStageQuestionTs(q.updated_at ?? q.created_at)}
                        </td>
                        <td className="table__actions">
                          <button
                            type="button"
                            className="btn btn--small btn--ghost"
                            onClick={() => {
                              setEditDocId(q.id)
                              setShowForm(true)
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
