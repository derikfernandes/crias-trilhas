import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
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
import {
  ConversationChat,
  LOGS_PAGE_SIZE,
} from '../components/ConversationChat'
import { StudentDetailPageView } from '../design/views/StudentDetailPageView'
import type { StudentDetailTrailRow } from '../design/types/studentDetailPageView'
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
  const [logsVisibleCount, setLogsVisibleCount] = useState(LOGS_PAGE_SIZE)

  const [institutionTrails, setInstitutionTrails] = useState<Trail[]>([])
  const [loadingInstitutionTrails, setLoadingInstitutionTrails] = useState(false)
  const [institutionTrailsError, setInstitutionTrailsError] = useState<
    string | null
  >(null)

  const [linkTrailId, setLinkTrailId] = useState('')
  const [linkStatus, setLinkStatus] = useState<StudentTrailStatus>('not_started')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null)
  const [editStage, setEditStage] = useState('')
  const [editQuestion, setEditQuestion] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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
    setLogsVisibleCount(LOGS_PAGE_SIZE)
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

  function handleStartEditTrail(row: StudentTrail) {
    setEditingTrailId(row.id)
    setEditStage(String(row.current_stage_number))
    setEditQuestion(String(row.current_question_number))
    setEditError(null)
  }

  function handleCancelEditTrail() {
    if (editBusy) return
    setEditingTrailId(null)
    setEditStage('')
    setEditQuestion('')
    setEditError(null)
  }

  function parsePositiveInteger(value: string, label: string): number {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`${label} deve ser um número inteiro maior ou igual a 1.`)
    }
    return n
  }

  async function handleSaveTrailPosition(row: StudentTrail) {
    if (!db) return
    setEditBusy(true)
    setEditError(null)
    try {
      const nextStage = parsePositiveInteger(editStage, 'Stage atual')
      const nextQuestion = parsePositiveInteger(editQuestion, 'Questão atual')
      const firestore = db
      await runTransaction(firestore, async (tx) => {
        const ref = doc(firestore, STUDENT_TRAILS_COLLECTION, row.id)
        const snap = await tx.get(ref)
        if (!snap.exists()) {
          throw new Error('Registro de trilha do aluno não encontrado.')
        }
        tx.update(ref, {
          current_stage_number: nextStage,
          current_question_number: nextQuestion,
          updated_at: serverTimestamp(),
          last_interaction_at: serverTimestamp(),
        })
      })
      setEditingTrailId(null)
      setEditStage('')
      setEditQuestion('')
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Erro ao atualizar progresso da trilha.',
      )
    } finally {
      setEditBusy(false)
    }
  }

  if (!id) {
    return <StudentDetailPageView status="missing-id" />
  }

  const trailRows: StudentDetailTrailRow[] = sortedTrails.map((row) => {
    const meta = trailById.get(row.trail_id)
    const label = meta?.name?.trim() ? meta.name : row.trail_id
    return {
      id: row.id,
      trailHref: trailPath(row.trail_id),
      trailLabel: label,
      trailIdSecondary: meta?.name?.trim() ? row.trail_id : null,
      inactiveHint: Boolean(meta?.name?.trim() && !meta.active),
      isEditing: editingTrailId === row.id,
      stageDisplay: row.current_stage_number,
      questionDisplay: row.current_question_number,
      status: row.status,
      startedAtLabel: row.started_at?.toDate
        ? row.started_at.toDate().toLocaleString('pt-BR')
        : '—',
      lastInteractionAtLabel: row.last_interaction_at?.toDate
        ? row.last_interaction_at.toDate().toLocaleString('pt-BR')
        : '—',
    }
  })

  return (
    <StudentDetailPageView
      status="ok"
      error={error}
      loading={loading}
      notFound={!stu}
      formSlot={stu ? <StudentForm docId={id} initial={stu} /> : null}
      hasStudent={Boolean(stu)}
      loadingTrails={loadingTrails}
      trailsError={trailsError}
      editError={editError}
      trailRows={trailRows}
      editStage={editStage}
      editQuestion={editQuestion}
      editBusy={editBusy}
      onEditStageChange={setEditStage}
      onEditQuestionChange={setEditQuestion}
      onStartEditTrail={(rowId) => {
        const row = trails.find((t) => t.id === rowId)
        if (row) handleStartEditTrail(row)
      }}
      onCancelEditTrail={handleCancelEditTrail}
      onSaveTrailPosition={(rowId) => {
        const row = trails.find((t) => t.id === rowId)
        if (row) void handleSaveTrailPosition(row)
      }}
      missingInstitutionId={!stu?.institution_id}
      institutionTrailsError={institutionTrailsError}
      linkError={linkError}
      linkTrailId={linkTrailId}
      onLinkTrailIdChange={setLinkTrailId}
      linkStatus={linkStatus}
      onLinkStatusChange={(value) =>
        setLinkStatus(value as StudentTrailStatus)
      }
      linkBusy={linkBusy}
      loadingInstitutionTrails={loadingInstitutionTrails}
      linkableTrails={linkableTrails.map((t) => ({
        id: t.id,
        label: `${t.name?.trim() ? `${t.name} (${t.id})` : t.id}${
          !t.active ? ' — inativa' : ''
        }`,
      }))}
      onLinkTrailSubmit={(e) => void handleLinkTrail(e)}
      loadingLogs={loadingLogs}
      logsError={logsError}
      logsEmpty={logs.length === 0}
      chatSlot={
        logs.length > 0 ? (
          <ConversationChat
            logs={logs}
            visibleCount={logsVisibleCount}
            showTrail
            onLoadMore={() =>
              setLogsVisibleCount((count) =>
                Math.min(count + LOGS_PAGE_SIZE, logs.length),
              )
            }
          />
        ) : null
      }
    />
  )
}
