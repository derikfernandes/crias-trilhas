import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { TRAILS_COLLECTION, snapshotToTrail } from '../lib/trailFirestore'
import {
  TRAIL_STAGES_COLLECTION,
  formatTrailStageTs,
  snapshotToTrailStage,
} from '../lib/trailStageFirestore'
import {
  STUDENT_TRAILS_COLLECTION,
  snapshotToStudentTrail,
  studentTrailDocId,
} from '../lib/studentTrailFirestore'
import {
  snapshotToStudent,
  STUDENTS_COLLECTION,
} from '../lib/studentFirestore'
import {
  CONVERSATION_LOGS_COLLECTION,
  snapshotToConversationLog,
} from '../lib/conversationLogFirestore'
import { TrailForm } from '../components/TrailForm'
import { TrailStageForm } from '../components/TrailStageForm'
import type { Trail } from '../types/trail'
import type { TrailStage } from '../types/trailStage'
import type { StudentTrail } from '../types/studentTrail'
import type { ConversationLog } from '../types/conversationLog'
import type { Student } from '../types/student'
import { studentPath, trailStageQuestionsPath } from '../lib/paths'

export function TrailDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [trail, setTrail] = useState<Trail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [stages, setStages] = useState<TrailStage[]>([])
  const [loadingStages, setLoadingStages] = useState(true)
  const [stagesError, setStagesError] = useState<string | null>(null)

  const [studentTrails, setStudentTrails] = useState<StudentTrail[]>([])
  const [loadingStudentTrails, setLoadingStudentTrails] = useState(true)
  const [studentTrailsError, setStudentTrailsError] = useState<string | null>(null)

  const [institutionStudents, setInstitutionStudents] = useState<Student[]>([])
  const [loadingInstitutionStudents, setLoadingInstitutionStudents] =
    useState(false)
  const [institutionStudentsError, setInstitutionStudentsError] = useState<
    string | null
  >(null)

  const [showAddStudentPicker, setShowAddStudentPicker] = useState(false)
  const [studentPickerFilter, setStudentPickerFilter] = useState('')
  const [addStudentError, setAddStudentError] = useState<string | null>(null)
  const [addingStudentId, setAddingStudentId] = useState<string | null>(null)

  const [logs, setLogs] = useState<ConversationLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)

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

  const sortedStudentTrails = useMemo(() => {
    return [...studentTrails].sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [studentTrails])

  const studentNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of institutionStudents) {
      m.set(s.id, s.name?.trim() || s.id)
    }
    return m
  }, [institutionStudents])

  const eligibleStudentsToAdd = useMemo(() => {
    const inTrail = new Set(studentTrails.map((st) => st.student_id))
    return institutionStudents
      .filter((s) => s.institution_id && !inTrail.has(s.id))
      .sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', {
          sensitivity: 'base',
        }),
      )
  }, [institutionStudents, studentTrails])

  const filteredEligibleStudents = useMemo(() => {
    const q = studentPickerFilter.trim().toLowerCase()
    if (!q) return eligibleStudentsToAdd
    const digits = studentPickerFilter.replace(/\D/g, '')
    return eligibleStudentsToAdd.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true
      if (s.id.toLowerCase().includes(q)) return true
      if (digits.length > 0 && s.phone_number.includes(digits)) return true
      return false
    })
  }, [eligibleStudentsToAdd, studentPickerFilter])

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const ma = a.created_at?.toMillis?.() ?? 0
      const mb = b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [logs])

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
      setLoadingLogs(true)
      setLogsError(null)

      const q = query(
        collection(dbOk, CONVERSATION_LOGS_COLLECTION),
        where('trail_id', '==', id),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs.map(snapshotToConversationLog)
          setLogs(next)
          setLogsError(null)
          setLoadingLogs(false)
        },
        (err) => {
          setLogsError(err.message)
          setLoadingLogs(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [id])

  useEffect(() => {
    if (!db || !id) return
    const dbOk = db
    let unsub: (() => void) | null = null

    async function run() {
      setLoadingStudentTrails(true)
      setStudentTrailsError(null)

      const q = query(
        collection(dbOk, STUDENT_TRAILS_COLLECTION),
        where('trail_id', '==', id),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs.map(snapshotToStudentTrail)
          setStudentTrails(next)
          setStudentTrailsError(null)
          setLoadingStudentTrails(false)
        },
        (err) => {
          setStudentTrailsError(err.message)
          setLoadingStudentTrails(false)
        },
      )
    }

    void run()
    return () => unsub?.()
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

  useEffect(() => {
    if (!db || !trail?.institution_id?.trim()) {
      setInstitutionStudents([])
      setInstitutionStudentsError(null)
      setLoadingInstitutionStudents(false)
      return
    }

    const instId = trail.institution_id.trim()
    setLoadingInstitutionStudents(true)
    setInstitutionStudentsError(null)

    const q = query(
      collection(db, STUDENTS_COLLECTION),
      where('institution_id', '==', instId),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map(snapshotToStudent)
        next.sort((a, b) =>
          (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', {
            sensitivity: 'base',
          }),
        )
        setInstitutionStudents(next)
        setInstitutionStudentsError(null)
        setLoadingInstitutionStudents(false)
      },
      (err) => {
        setInstitutionStudentsError(err.message)
        setInstitutionStudents([])
        setLoadingInstitutionStudents(false)
      },
    )

    return () => unsub()
  }, [trail?.institution_id])

  useEffect(() => {
    if (!showAddStudentPicker) {
      setStudentPickerFilter('')
      setAddStudentError(null)
    }
  }, [showAddStudentPicker])

  async function addStudentToTrail(studentId: string) {
    if (!db || !id || !trail?.institution_id?.trim()) return
    const instId = trail.institution_id.trim()
    setAddStudentError(null)
    setAddingStudentId(studentId)
    const docRef = doc(
      db,
      STUDENT_TRAILS_COLLECTION,
      studentTrailDocId(studentId, id),
    )
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef)
        if (snap.exists()) {
          throw new Error(
            'Este aluno já possui registro nesta trilha (student_trails).',
          )
        }
        transaction.set(docRef, {
          student_id: studentId,
          institution_id: instId,
          trail_id: id,
          current_stage_number: 1,
          current_question_number: 1,
          status: 'not_started',
          started_at: null,
          completed_at: null,
          last_interaction_at: null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
      })
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Não foi possível adicionar o aluno.'
      setAddStudentError(msg)
    } finally {
      setAddingStudentId(null)
    }
  }

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
              <h2>Alunos na trilha (student_trails)</h2>
              <div className="trail-panel-head__aside">
                {loadingStudentTrails ? (
                  <span className="muted">Carregando progresso…</span>
                ) : null}
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={!trail.institution_id?.trim() || !db}
                  onClick={() =>
                    setShowAddStudentPicker((open) => !open)
                  }
                >
                  {showAddStudentPicker ? 'Fechar' : 'Adicionar aluno'}
                </button>
              </div>
            </div>

            {showAddStudentPicker ? (
              <div className="trail-add-students">
                {!trail.institution_id?.trim() ? (
                  <p className="muted" role="status">
                    Defina a instituição da trilha no formulário acima para listar
                    alunos.
                  </p>
                ) : institutionStudentsError ? (
                  <p className="banner banner--error" role="alert">
                    {institutionStudentsError}
                  </p>
                ) : loadingInstitutionStudents ? (
                  <p className="muted" role="status">
                    Carregando alunos da instituição…
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ margin: '0 0 0.75rem' }}>
                      Alunos da mesma instituição da trilha que ainda não têm registro
                      em <code>student_trails</code>. A inclusão grava direto no
                      Firestore (sem API nova).
                    </p>
                    <div className="trail-add-students__filter">
                      <label className="muted" htmlFor="trail-add-student-filter">
                        Filtrar por nome ou ID
                      </label>
                      <input
                        id="trail-add-student-filter"
                        type="search"
                        autoComplete="off"
                        placeholder="Ex.: nome ou parte do ID"
                        value={studentPickerFilter}
                        onChange={(e) => setStudentPickerFilter(e.target.value)}
                      />
                    </div>
                    {addStudentError ? (
                      <p className="banner banner--error" role="alert">
                        {addStudentError}
                      </p>
                    ) : null}
                    {eligibleStudentsToAdd.length === 0 ? (
                      <p className="muted" role="status">
                        {institutionStudents.length === 0
                          ? 'Não há alunos cadastrados nesta instituição.'
                          : 'Todos os alunos desta instituição já estão nesta trilha.'}
                      </p>
                    ) : filteredEligibleStudents.length === 0 ? (
                      <p className="muted" role="status">
                        Nenhum aluno corresponde ao filtro.
                      </p>
                    ) : (
                      <ul className="trail-add-students__list">
                        {filteredEligibleStudents.map((s) => (
                          <li key={s.id}>
                            <div className="trail-add-students__row">
                              <span>
                                <strong>{s.name || '—'}</strong>{' '}
                                <code className="muted">{s.id}</code>
                              </span>
                              <button
                                type="button"
                                className="btn btn--small btn--ghost"
                                disabled={addingStudentId !== null || !db}
                                onClick={() => void addStudentToTrail(s.id)}
                              >
                                {addingStudentId === s.id
                                  ? 'Adicionando…'
                                  : 'Incluir na trilha'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {studentTrailsError ? (
              <p className="banner banner--error" role="alert">
                {studentTrailsError}
              </p>
            ) : null}

            {!loadingStudentTrails && sortedStudentTrails.length === 0 ? (
              <p className="muted">
                Nenhum aluno com progresso registrado nesta trilha ainda. Use{' '}
                <strong>Adicionar aluno</strong> para criar o vínculo ou aguarde o
                chatbot criar/atualizar <code>student_trails</code> quando o aluno
                avançar.
              </p>
            ) : null}

            {sortedStudentTrails.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Stage atual</th>
                      <th>Questão atual</th>
                      <th>Status</th>
                      <th>Início</th>
                      <th>Última interação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudentTrails.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link
                            className="table__name-link"
                            to={studentPath(row.student_id)}
                          >
                            {studentNameById.get(row.student_id) ?? (
                              <code>{row.student_id}</code>
                            )}
                          </Link>
                        </td>
                        <td>{row.current_stage_number}</td>
                        <td>{row.current_question_number}</td>
                        <td>
                          <code>{row.status}</code>
                        </td>
                        <td>
                          {row.started_at?.toDate
                            ? row.started_at.toDate().toLocaleString('pt-BR')
                            : '—'}
                        </td>
                        <td>
                          {row.last_interaction_at?.toDate
                            ? row.last_interaction_at.toDate().toLocaleString('pt-BR')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Histórico de conversa na trilha (conversation_logs)</h2>
              {loadingLogs ? (
                <span className="muted">Carregando histórico…</span>
              ) : null}
            </div>

            {logsError ? (
              <p className="banner banner--error" role="alert">
                {logsError}
              </p>
            ) : null}

            {!loadingLogs && sortedLogs.length === 0 ? (
              <p className="muted">
                Nenhum log de conversa encontrado para esta trilha ainda. Cada mensagem
                trocada pelo chatbot gera um registro em <code>conversation_logs</code>.
              </p>
            ) : null}

            {sortedLogs.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Aluno</th>
                      <th>Stage</th>
                      <th>Questão</th>
                      <th>Remetente</th>
                      <th>Tipo</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLogs.slice(0, 200).map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.created_at_brasilia
                            ? row.created_at_brasilia
                            : row.created_at?.toDate
                              ? row.created_at.toDate().toLocaleString('pt-BR')
                              : '—'}
                        </td>
                        <td>
                          <code>{row.student_id}</code>
                        </td>
                        <td>{row.stage_number}</td>
                        <td>{row.question_number}</td>
                        <td>
                          <code>{row.sender}</code>
                        </td>
                        <td>{row.message_type ?? '—'}</td>
                        <td className="table__text">
                          {row.message_text.length > 200
                            ? `${row.message_text.slice(0, 200)}…`
                            : row.message_text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

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
                      <th>Tipo</th>
                      <th>Prompt</th>
                      <th>Ativo</th>
                      <th>Liberado</th>
                      <th>Atualizado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="muted table__empty">
                          Nenhum stage cadastrado.
                        </td>
                      </tr>
                    ) : (
                      stages.map((s) => (
                        <tr key={s.id}>
                          <td>{s.stage_number}</td>
                          <td>{s.title || '—'}</td>
                          <td>
                            <code>{s.stage_type}</code>
                          </td>
                          <td className="table__text">
                            {s.prompt
                              ? s.prompt.length > 48
                                ? `${s.prompt.slice(0, 48)}…`
                                : s.prompt
                              : '—'}
                          </td>
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

