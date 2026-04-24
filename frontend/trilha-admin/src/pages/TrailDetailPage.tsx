import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { INSTITUTIONS_COLLECTION } from '../lib/institutionFirestore'
import {
  formatTrailTs,
  TRAILS_COLLECTION,
  snapshotToTrail,
} from '../lib/trailFirestore'
import {
  TRAIL_STAGES_COLLECTION,
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
  const [createStageNumber, setCreateStageNumber] = useState<number | null>(null)
  const [showTrailForm, setShowTrailForm] = useState(false)
  const [defaultStepsInput, setDefaultStepsInput] = useState('')
  const [savingDefaultSteps, setSavingDefaultSteps] = useState(false)
  const [defaultStepsError, setDefaultStepsError] = useState<string | null>(null)
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([])
  const [savingInstitutionId, setSavingInstitutionId] = useState(false)
  const [institutionError, setInstitutionError] = useState<string | null>(null)

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

  const stagesByNumber = useMemo(() => {
    const map = new Map<number, TrailStage>()
    for (const stage of stages) {
      map.set(stage.stage_number, stage)
    }
    return map
  }, [stages])

  const phaseCountPreview = useMemo(() => {
    const parsed = Number.parseInt(defaultStepsInput.trim(), 10)
    if (Number.isFinite(parsed) && parsed >= 1) return parsed
    const fallback = trail?.default_total_steps_per_stage ?? 1
    return fallback >= 1 ? fallback : 1
  }, [defaultStepsInput, trail?.default_total_steps_per_stage])

  const flowPhases = useMemo(() => {
    return Array.from({ length: phaseCountPreview }, (_, idx) => {
      const number = idx + 1
      const stage = stagesByNumber.get(number) ?? null
      return { number, stage }
    })
  }, [phaseCountPreview, stagesByNumber])

  const maxCreatedStageNumber = useMemo(() => {
    if (stages.length === 0) return 0
    return Math.max(...stages.map((s) => s.stage_number))
  }, [stages])

  const missingStageCount = useMemo(() => {
    return flowPhases.filter((item) => item.stage === null).length
  }, [flowPhases])

  const parsedDefaultStepsInput = useMemo(() => {
    const parsed = Number.parseInt(defaultStepsInput.trim(), 10)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null
    return parsed
  }, [defaultStepsInput])

  const reducingBelowCreated = useMemo(() => {
    if (parsedDefaultStepsInput === null) return false
    return parsedDefaultStepsInput < maxCreatedStageNumber
  }, [parsedDefaultStepsInput, maxCreatedStageNumber])

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

  useEffect(() => {
    if (!db) return
    const unsub = onSnapshot(collection(db, INSTITUTIONS_COLLECTION), (snap) => {
      const next = snap.docs.map((d) => {
        const data = d.data()
        const nm =
          typeof (data as Record<string, unknown>).name === 'string'
            ? ((data as Record<string, unknown>).name as string)
            : ''
        return { id: d.id, name: nm }
      })
      next.sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', {
          sensitivity: 'base',
        }),
      )
      setInstitutions(next)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    setDefaultStepsInput(String(trail?.default_total_steps_per_stage ?? 0))
    setDefaultStepsError(null)
  }, [trail?.default_total_steps_per_stage])

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

  async function saveDefaultStepsPerStage() {
    if (!db || !id) return
    const trimmed = defaultStepsInput.trim()
    const parsed = Number.parseInt(trimmed, 10)

    if (!trimmed || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setDefaultStepsError('Informe um número inteiro válido.')
      return
    }
    if (parsed < 1) {
      setDefaultStepsError('A quantidade de fases deve ser maior ou igual a 1.')
      return
    }
    if (parsed < maxCreatedStageNumber) {
      setDefaultStepsError(
        `Você já possui fases criadas até a fase ${maxCreatedStageNumber}. Para reduzir para ${parsed}, exclua primeiro as fases excedentes.`,
      )
      return
    }

    setSavingDefaultSteps(true)
    setDefaultStepsError(null)
    try {
      await updateDoc(doc(db, TRAILS_COLLECTION, id), {
        default_total_steps_per_stage: parsed,
        updated_at: serverTimestamp(),
      })
    } catch (e) {
      setDefaultStepsError(
        e instanceof Error ? e.message : 'Erro ao salvar quantidade de itens.',
      )
    } finally {
      setSavingDefaultSteps(false)
    }
  }

  async function handleInstitutionChange(nextInstitutionId: string) {
    if (!db || !id || !nextInstitutionId) return
    if (trail?.institution_id === nextInstitutionId) return

    setSavingInstitutionId(true)
    setInstitutionError(null)
    try {
      await updateDoc(doc(db, TRAILS_COLLECTION, id), {
        institution_id: nextInstitutionId,
        updated_at: serverTimestamp(),
      })
    } catch (e) {
      setInstitutionError(
        e instanceof Error ? e.message : 'Não foi possível atualizar a instituição.',
      )
    } finally {
      setSavingInstitutionId(false)
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
        <p className="admin__actions trail-header-actions">
          <Link className="btn btn--ghost" to="/gerenciamento">
            ← Gerenciamento
          </Link>
          <label className="trail-header-select">
            <span className="muted">Instituição</span>
            <select
              value={trail?.institution_id ?? ''}
              onChange={(e) => void handleInstitutionChange(e.target.value)}
              disabled={loading || !trail || savingInstitutionId || institutions.length === 0}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name ? `${inst.name} (${inst.id})` : inst.id}
                </option>
              ))}
            </select>
          </label>
        </p>
      </header>

      {institutionError ? (
        <p className="banner banner--error" role="alert">
          {institutionError}
        </p>
      ) : null}

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
          <section className="panel trail-cadastro-panel">
            <div className="trail-cadastro-summary">
              <div className="trail-cadastro-top">
                <p className="trail-cadastro-title">
                  {trail.name || 'Trilha'}{' '}
                  <span className="muted trail-cadastro-id">({trail.id})</span>
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowTrailForm((open) => !open)}
                >
                  {showTrailForm ? 'Fechar cadastro' : 'Abrir cadastro'}
                </button>
              </div>
              <dl className="trail-cadastro-details">
                <div className="trail-cadastro-details__row">
                  <dt>Matéria</dt>
                  <dd>{trail.subject || '—'}</dd>
                </div>
                <div className="trail-cadastro-details__row">
                  <dt>Descrição</dt>
                  <dd
                    className="trail-cadastro-ellipsis"
                    title={trail.description || '—'}
                  >
                    {trail.description || '—'}
                  </dd>
                </div>
                <div className="trail-cadastro-details__row">
                  <dt>Ativa</dt>
                  <dd>{trail.active ? 'Sim' : 'Não'}</dd>
                </div>
                <div className="trail-cadastro-details__row">
                  <dt>Criada em</dt>
                  <dd>{formatTrailTs(trail.created_at)}</dd>
                </div>
                <div className="trail-cadastro-details__row">
                  <dt>Atualizada em</dt>
                  <dd>{formatTrailTs(trail.updated_at)}</dd>
                </div>
              </dl>
            </div>
          </section>

          {showTrailForm ? (
            <TrailForm
              docId={id}
              initial={trail}
              onSaved={() => setShowTrailForm(false)}
            />
          ) : null}

          <section className="panel">
              <div className="panel__head">
                <h2>Estrutura da trilha</h2>
              </div>

              <div className="trail-structure-config">
                <label className="field trail-structure-count">
                  <span>Quantidade de fases (stages)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={defaultStepsInput}
                    onChange={(e) => setDefaultStepsInput(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void saveDefaultStepsPerStage()}
                  disabled={savingDefaultSteps || reducingBelowCreated}
                >
                  {savingDefaultSteps ? 'Salvando…' : 'Salvar quantidade'}
                </button>
              </div>

              {reducingBelowCreated ? (
                <p className="banner banner--error" role="alert">
                  Você já possui fases criadas até a fase {maxCreatedStageNumber}.
                  Para diminuir a quantidade, exclua primeiro as fases excedentes.
                </p>
              ) : null}

              {defaultStepsError ? (
                <p className="form__error" role="alert">
                  {defaultStepsError}
                </p>
              ) : null}

              {missingStageCount > 0 ? (
                <p className="banner banner--error" role="alert">
                  Existem {missingStageCount} fase(s) sem cadastro neste fluxo.
                  Complete as fases marcadas como "Stage ainda não criado".
                </p>
              ) : null}

              <div className="trail-flow" role="region" aria-label="Fluxo da estrutura da trilha">
                <div className="trail-flow__etapa">Etapa</div>
                <div className="trail-flow__stages">
                  {flowPhases.map((item, idx) => (
                    <div key={item.number}>
                      <div className="trail-flow__row">
                        <div className="trail-flow__stage-card">
                          <strong>Fase {item.number}</strong>
                          <span className="muted">
                            {item.stage?.title?.trim() || 'Stage ainda não criado'}
                          </span>
                          {item.stage ? (
                            <div className="trail-flow__actions">
                              <Link
                                className="btn btn--small btn--ghost"
                                to={trailStageQuestionsPath(id, item.number)}
                              >
                                Questões
                              </Link>
                              <button
                                type="button"
                                className="btn btn--small btn--ghost"
                                onClick={() => {
                                  setCreateStageNumber(null)
                                  setEditStageId(item.stage!.id)
                                  setShowStageForm(true)
                                }}
                              >
                                Editar
                              </button>
                            </div>
                          ) : (
                            <div className="trail-flow__actions">
                              <button
                                type="button"
                                className="btn btn--small btn--primary"
                                onClick={() => {
                                  setCreateStageNumber(item.number)
                                  setEditStageId(null)
                                  setShowStageForm(true)
                                }}
                              >
                                Criar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {idx < flowPhases.length - 1 ? (
                        <div className="trail-flow__down" aria-hidden>
                          ↓
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="trail-structure-note" role="note">
                <p>Defina quantas fases existem dentro de cada etapa da trilha.</p>
                <p>
                  Cada etapa seguirá essa mesma estrutura, garantindo um padrão de
                  aprendizado (por exemplo: contexto, explicação, prática).
                </p>
                <p>
                  <strong>⚠️ Esse número é fixo para toda a trilha.</strong>
                </p>
              </div>

              {loadingStages ? (
                <p className="muted">Carregando stages…</p>
              ) : stagesError ? (
                <p className="banner banner--error" role="alert">
                  {stagesError}
                </p>
              ) : null}

              {showStageForm ? (
                editStageId ? (
                  editingStage ? (
                    <TrailStageForm
                      trailId={id}
                      docId={editStageId ?? undefined}
                      initial={editingStage}
                      suggestedStageNumber={createStageNumber ?? suggestedNextStageNumber}
                      onCancel={() => {
                        setShowStageForm(false)
                        setEditStageId(null)
                        setCreateStageNumber(null)
                      }}
                      onSaved={() => {
                        setShowStageForm(false)
                        setEditStageId(null)
                        setCreateStageNumber(null)
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
                    suggestedStageNumber={createStageNumber ?? suggestedNextStageNumber}
                    onCancel={() => {
                      setShowStageForm(false)
                      setCreateStageNumber(null)
                    }}
                    onSaved={() => {
                      setShowStageForm(false)
                      setCreateStageNumber(null)
                    }}
                  />
                )
              ) : null}
          </section>

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

        </>
      )}
    </>
  )
}

