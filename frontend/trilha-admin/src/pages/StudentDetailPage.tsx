import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { STUDENTS_COLLECTION, snapshotToStudent } from '../lib/studentFirestore'
import {
  STUDENT_TRAILS_COLLECTION,
  snapshotToStudentTrail,
  studentTrailDocId,
} from '../lib/studentTrailFirestore'
import { TRAILS_COLLECTION, snapshotToTrail } from '../lib/trailFirestore'
import { trailPath } from '../lib/paths'
import {
  CONVERSATION_LOGS_COLLECTION,
  snapshotToConversationLog,
} from '../lib/conversationLogFirestore'
import { StudentForm } from '../components/StudentForm'
import type { Student } from '../types/student'
import type { StudentTrail, StudentTrailStatus } from '../types/studentTrail'
import type { ConversationLog } from '../types/conversationLog'
import type { Trail } from '../types/trail'

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [stu, setStu] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [trails, setTrails] = useState<StudentTrail[]>([])
  const [loadingTrails, setLoadingTrails] = useState(true)
  const [trailsError, setTrailsError] = useState<string | null>(null)

  const [logs, setLogs] = useState<ConversationLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)

  const [institutionTrails, setInstitutionTrails] = useState<Trail[]>([])
  const [loadingInstitutionTrails, setLoadingInstitutionTrails] = useState(false)
  const [institutionTrailsError, setInstitutionTrailsError] = useState<
    string | null
  >(null)

  const [linkTrailId, setLinkTrailId] = useState('')
  const [linkStatus, setLinkStatus] = useState<StudentTrailStatus>('not_started')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !id) return
    const unsub = onSnapshot(
      doc(db, STUDENTS_COLLECTION, id),
      (snap) => {
        if (!snap.exists()) {
          setStu(null)
          setError(null)
          setLoading(false)
          return
        }

        setStu(snapshotToStudent(snap))
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
        where('student_id', '==', id),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs.map(snapshotToConversationLog)
          next.sort((a, b) => {
            const ma = a.created_at?.toMillis?.() ?? 0
            const mb = b.created_at?.toMillis?.() ?? 0
            return mb - ma
          })
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
      setLoadingTrails(true)
      setTrailsError(null)

      const q = query(
        collection(dbOk, STUDENT_TRAILS_COLLECTION),
        where('student_id', '==', id),
      )

      unsub = onSnapshot(
        q,
        (snap) => {
          const next = snap.docs.map(snapshotToStudentTrail)
          setTrails(next)
          setTrailsError(null)
          setLoadingTrails(false)
        },
        (err) => {
          setTrailsError(err.message)
          setLoadingTrails(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [id])

  useEffect(() => {
    if (!db || !stu?.institution_id) {
      setInstitutionTrails([])
      setLoadingInstitutionTrails(false)
      setInstitutionTrailsError(null)
      return
    }
    const dbOk = db
    const instId = stu.institution_id
    let unsub: (() => void) | null = null

    setLoadingInstitutionTrails(true)
    setInstitutionTrailsError(null)

    const q = query(
      collection(dbOk, TRAILS_COLLECTION),
      where('institution_id', '==', instId),
    )

    unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map(snapshotToTrail)
        next.sort((a, b) => {
          const an = (a.name || a.id).toLowerCase()
          const bn = (b.name || b.id).toLowerCase()
          return an.localeCompare(bn, 'pt-BR')
        })
        setInstitutionTrails(next)
        setInstitutionTrailsError(null)
        setLoadingInstitutionTrails(false)
      },
      (err) => {
        setInstitutionTrailsError(err.message)
        setLoadingInstitutionTrails(false)
      },
    )

    return () => unsub?.()
  }, [stu?.institution_id])

  const sortedTrails = useMemo(() => {
    return [...trails].sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [trails])

  const trailById = useMemo(() => {
    const m = new Map<string, Trail>()
    for (const t of institutionTrails) m.set(t.id, t)
    return m
  }, [institutionTrails])

  const linkedTrailIdSet = useMemo(() => {
    return new Set(trails.map((t) => t.trail_id).filter(Boolean))
  }, [trails])

  const linkableTrails = useMemo(() => {
    return institutionTrails.filter((t) => !linkedTrailIdSet.has(t.id))
  }, [institutionTrails, linkedTrailIdSet])

  async function handleLinkTrail(e: FormEvent) {
    e.preventDefault()
    if (!db || !id || !stu?.institution_id) return
    const firestore = db
    const trailId = linkTrailId.trim()
    if (!trailId) {
      setLinkError('Selecione uma trilha.')
      return
    }

    setLinkBusy(true)
    setLinkError(null)
    try {
      await runTransaction(firestore, async (tx) => {
        const ref = doc(
          firestore,
          STUDENT_TRAILS_COLLECTION,
          studentTrailDocId(id, trailId),
        )
        const snap = await tx.get(ref)
        if (snap.exists()) {
          throw new Error(
            'Este aluno já está vinculado a esta trilha (registro já existe).',
          )
        }
        const now = serverTimestamp()
        const base: Record<string, unknown> = {
          student_id: id,
          institution_id: stu.institution_id,
          trail_id: trailId,
          current_stage_number: 1,
          current_question_number: 1,
          status: linkStatus,
          completed_at: null,
          last_interaction_at: null,
          created_at: now,
          updated_at: now,
        }
        if (linkStatus === 'in_progress') {
          base.started_at = now
        } else {
          base.started_at = null
        }
        tx.set(ref, base)
      })
      setLinkTrailId('')
      setLinkStatus('not_started')
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Erro ao vincular trilha.')
    } finally {
      setLinkBusy(false)
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
        <h1>Aluno</h1>
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
      ) : !stu ? (
        <p className="banner banner--error" role="alert">
          Registro não encontrado.
        </p>
      ) : (
        <StudentForm docId={id} initial={stu} />
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>Trilhas vinculadas (student_trails)</h2>
          {loadingTrails ? (
            <span className="muted">Carregando progresso…</span>
          ) : null}
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Abaixo aparecem as trilhas em que este aluno tem registro de progresso.
          Você pode vincular manualmente trilhas da mesma instituição do aluno.
        </p>

        {trailsError ? (
          <p className="banner banner--error" role="alert">
            {trailsError}
          </p>
        ) : null}

        {!loadingTrails && sortedTrails.length === 0 ? (
          <p className="muted">
            Nenhuma trilha vinculada ainda. Use o formulário abaixo para vincular,
            ou o chatbot pode criar e atualizar registros em{' '}
            <code>student_trails</code> automaticamente.
          </p>
        ) : null}

        {sortedTrails.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trilha</th>
                  <th>Stage atual</th>
                  <th>Questão atual</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Última interação</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrails.map((row) => {
                  const meta = trailById.get(row.trail_id)
                  const label = meta?.name?.trim()
                    ? meta.name
                    : row.trail_id
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link to={trailPath(row.trail_id)}>{label}</Link>
                        {meta?.name?.trim() ? (
                          <div className="muted" style={{ fontSize: '0.85em' }}>
                            <code>{row.trail_id}</code>
                            {!meta.active ? ' · inativa' : null}
                          </div>
                        ) : null}
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
                          ? row.last_interaction_at
                              .toDate()
                              .toLocaleString('pt-BR')
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {stu ? (
          <>
            <h3 style={{ margin: '1.25rem 0 0.75rem', fontSize: '1.05rem' }}>
              Vincular nova trilha
            </h3>
            {!stu.institution_id ? (
              <p className="banner banner--error" role="alert">
                Este aluno não tem <code>institution_id</code>. Defina a instituição
                no cadastro acima antes de vincular trilhas.
              </p>
            ) : (
              <form className="form" onSubmit={handleLinkTrail}>
                {institutionTrailsError ? (
                  <p className="banner banner--error" role="alert">
                    {institutionTrailsError}
                  </p>
                ) : null}
                {linkError ? (
                  <p className="banner banner--error" role="alert">
                    {linkError}
                  </p>
                ) : null}

                <label className="field">
                  <span>Trilha</span>
                  <select
                    value={linkTrailId}
                    onChange={(e) => setLinkTrailId(e.target.value)}
                    disabled={
                      linkBusy || loadingInstitutionTrails || linkableTrails.length === 0
                    }
                  >
                    <option value="">
                      {loadingInstitutionTrails
                        ? 'Carregando trilhas…'
                        : linkableTrails.length === 0
                          ? 'Nenhuma trilha disponível (todas vinculadas ou sem trilhas na instituição)'
                          : 'Selecione…'}
                    </option>
                    {linkableTrails.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name?.trim() ? `${t.name} (${t.id})` : t.id}
                        {!t.active ? ' — inativa' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Status inicial</span>
                  <select
                    value={linkStatus}
                    onChange={(e) =>
                      setLinkStatus(e.target.value as StudentTrailStatus)
                    }
                    disabled={linkBusy}
                  >
                    <option value="not_started">not_started</option>
                    <option value="in_progress">in_progress</option>
                  </select>
                </label>

                <div className="form__actions">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={
                      linkBusy ||
                      !linkTrailId ||
                      loadingInstitutionTrails ||
                      linkableTrails.length === 0
                    }
                  >
                    {linkBusy ? 'Vinculando…' : 'Vincular trilha'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Histórico de conversa (conversation_logs)</h2>
          {loadingLogs ? <span className="muted">Carregando histórico…</span> : null}
        </div>

        {logsError ? (
          <p className="banner banner--error" role="alert">
            {logsError}
          </p>
        ) : null}

        {!loadingLogs && logs.length === 0 ? (
          <p className="muted">
            Nenhum log de conversa encontrado para este aluno ainda. Cada mensagem
            trocada pelo chatbot gera um registro em <code>conversation_logs</code>.
          </p>
        ) : null}

        {logs.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Trilha</th>
                  <th>Stage</th>
                  <th>Questão</th>
                  <th>Remetente</th>
                  <th>Tipo</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.created_at_brasilia
                        ? row.created_at_brasilia
                        : row.created_at?.toDate
                          ? row.created_at.toDate().toLocaleString('pt-BR')
                          : '—'}
                    </td>
                    <td>
                      <code>{row.trail_id}</code>
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
  )
}

