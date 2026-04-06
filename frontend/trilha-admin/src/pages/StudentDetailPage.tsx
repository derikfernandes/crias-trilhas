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
import { STUDENTS_COLLECTION, snapshotToStudent } from '../lib/studentFirestore'
import {
  STUDENT_TRAILS_COLLECTION,
  snapshotToStudentTrail,
} from '../lib/studentTrailFirestore'
import {
  CONVERSATION_LOGS_COLLECTION,
  snapshotToConversationLog,
} from '../lib/conversationLogFirestore'
import { StudentForm } from '../components/StudentForm'
import type { Student } from '../types/student'
import type { StudentTrail } from '../types/studentTrail'
import type { ConversationLog } from '../types/conversationLog'

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

  const sortedTrails = useMemo(() => {
    return [...trails].sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [trails])

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
          <h2>Progresso em trilhas (student_trails)</h2>
          {loadingTrails ? (
            <span className="muted">Carregando progresso…</span>
          ) : null}
        </div>

        {trailsError ? (
          <p className="banner banner--error" role="alert">
            {trailsError}
          </p>
        ) : null}

        {!loadingTrails && sortedTrails.length === 0 ? (
          <p className="muted">
            Nenhuma trilha encontrada para este aluno ainda. O chatbot cria e
            atualiza registros em <code>student_trails</code> automaticamente.
          </p>
        ) : null}

        {sortedTrails.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trail</th>
                  <th>Stage atual</th>
                  <th>Questão atual</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Última interação</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrails.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.trail_id}</code>
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
                ))}
              </tbody>
            </table>
          </div>
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

