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
import { TRAILS_COLLECTION, snapshotToTrail } from '../lib/trailFirestore'
import {
  TRAIL_STAGES_COLLECTION,
  formatTrailStageTs,
  snapshotToTrailStage,
} from '../lib/trailStageFirestore'
import { TrailForm } from '../components/TrailForm'
import { TrailStageForm } from '../components/TrailStageForm'
import type { Trail } from '../types/trail'
import type { TrailStage } from '../types/trailStage'
import { trailStageQuestionsPath } from '../lib/paths'

export function TrailDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [trail, setTrail] = useState<Trail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [stages, setStages] = useState<TrailStage[]>([])
  const [loadingStages, setLoadingStages] = useState(true)
  const [stagesError, setStagesError] = useState<string | null>(null)

  const [showStageForm, setShowStageForm] = useState(false)
  const [editStageId, setEditStageId] = useState<string | null>(null)

  const editingStage = useMemo(() => {
    if (!editStageId) return null
    return stages.find((s) => s.id === editStageId) ?? null
  }, [editStageId, stages])

  const suggestedNextStageNumber = useMemo(() => {
    if (stages.length === 0) return 1
    const max = Math.max(...stages.map((s) => s.stage_number))
    return max + 1
  }, [stages])

  useEffect(() => {
    if (!db || !id) return

    const unsub = onSnapshot(
      doc(db, TRAILS_COLLECTION, id),
      (snap) => {
        if (!snap.exists()) {
          setTrail(null)
          setError(null)
          setLoading(false)
          return
        }

        setTrail(snapshotToTrail(snap))
        setError(null)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [id])

  useEffect(() => {
    if (!db || !id) return
    const dbOk = db
    let unsub: (() => void) | null = null

    async function run() {
      setLoadingStages(true)
      setStagesError(null)

      const q = query(
        collection(dbOk, TRAIL_STAGES_COLLECTION),
        where('trail_id', '==', id),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          // Sem `orderBy` para não exigir índice composto no Firestore.
          // A ordenação por `stage_number` é feita no client.
          const next = snap.docs.map(snapshotToTrailStage)
          next.sort((a, b) => a.stage_number - b.stage_number)
          setStages(next)
          setStagesError(null)
          setLoadingStages(false)
        },
        (err) => {
          setStagesError(err.message)
          setLoadingStages(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [id])

  if (!id) {
    return (
      <p className="banner banner--error" role="alert">
        ID ausente na URL.
      </p>
    )
  }

  return (
    <>
      <header className="admin__header">
        <h1>Trilha</h1>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/">
            ← Voltar ao início
          </Link>
        </p>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : !trail ? (
        <p className="banner banner--error" role="alert">
          Registro não encontrado.
        </p>
      ) : (
        <>
          <TrailForm docId={id} initial={trail} />

          <section className="panel">
            <div className="panel__head">
              <h2>Stages</h2>
              <p className="panel__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setEditStageId(null)
                    setShowStageForm(true)
                  }}
                  disabled={!id}
                >
                  + Novo stage
                </button>
              </p>
            </div>

            {showStageForm ? (
              editStageId ? (
                editingStage ? (
                  <TrailStageForm
                    trailId={id}
                    docId={editStageId ?? undefined}
                    initial={editingStage}
                    suggestedStageNumber={suggestedNextStageNumber}
                    onCancel={() => {
                      setShowStageForm(false)
                      setEditStageId(null)
                    }}
                    onSaved={() => {
                      setShowStageForm(false)
                      setEditStageId(null)
                    }}
                  />
                ) : (
                  <p className="muted">Carregando stage…</p>
                )
              ) : (
                <TrailStageForm
                  trailId={id}
                  docId={undefined}
                  initial={undefined}
                  suggestedStageNumber={suggestedNextStageNumber}
                  onCancel={() => {
                    setShowStageForm(false)
                  }}
                  onSaved={() => {
                    setShowStageForm(false)
                  }}
                />
              )
            ) : null}

            {loadingStages ? (
              <p className="muted">Carregando stages…</p>
            ) : stagesError ? (
              <p className="banner banner--error" role="alert">
                {stagesError}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>Ativo</th>
                      <th>Liberado</th>
                      <th>Atualizado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted table__empty">
                          Nenhum stage cadastrado.
                        </td>
                      </tr>
                    ) : (
                      stages.map((s) => (
                        <tr key={s.id}>
                          <td>{s.stage_number}</td>
                          <td>{s.title || '—'}</td>
                          <td>{s.active ? 'Sim' : 'Não'}</td>
                          <td>{s.is_released ? 'Sim' : 'Não'}</td>
                          <td>{formatTrailStageTs(s.updated_at ?? s.created_at)}</td>
                          <td className="table__actions">
                            <Link
                              className="btn btn--small btn--ghost"
                              to={trailStageQuestionsPath(id, s.stage_number)}
                            >
                              Questões
                            </Link>
                            <button
                              type="button"
                              className="btn btn--small btn--ghost"
                              onClick={() => {
                                setEditStageId(s.id)
                                setShowStageForm(true)
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
        </>
      )}
    </>
  )
}

