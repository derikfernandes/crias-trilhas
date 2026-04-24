import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  formatInstitutionTs,
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import {
  formatStudentTs,
  snapshotToStudent,
  STUDENTS_COLLECTION,
} from '../lib/studentFirestore'
import {
  snapshotToStudentTrail,
  STUDENT_TRAILS_COLLECTION,
} from '../lib/studentTrailFirestore'
import {
  formatTrailTs,
  snapshotToTrail,
  TRAILS_COLLECTION,
} from '../lib/trailFirestore'
import { institutionPath, studentPath, trailPath } from '../lib/paths'
import type { Institution } from '../types/institution'
import type { Student } from '../types/student'
import type { StudentTrail } from '../types/studentTrail'
import type { Trail } from '../types/trail'

const LAST_INSTITUTION_ID_STORAGE_KEY = 'trilha_admin_selected_institution_id'

export function GerenciamentoPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loadingInst, setLoadingInst] = useState(true)
  const [instError, setInstError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)

  const [trails, setTrails] = useState<Trail[]>([])
  const [loadingTrails, setLoadingTrails] = useState(false)
  const [trailsError, setTrailsError] = useState<string | null>(null)
  const [deletingTrailId, setDeletingTrailId] = useState<string | null>(null)
  const [studentTrails, setStudentTrails] = useState<StudentTrail[]>([])
  const [loadingStudentTrails, setLoadingStudentTrails] = useState(false)
  const [studentTrailsError, setStudentTrailsError] = useState<string | null>(null)

  const sortedInstitutions = useMemo(() => {
    return [...institutions].sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [institutions])

  const selectedInstitution = useMemo(
    () => institutions.find((i) => i.id === selectedId) ?? null,
    [institutions, selectedId],
  )

  const trailNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of trails) map.set(t.id, t.name || t.id)
    return map
  }, [trails])

  const studentTrailByStudentId = useMemo(() => {
    const map = new Map<string, StudentTrail>()
    for (const st of studentTrails) {
      const current = map.get(st.student_id)
      if (!current) {
        map.set(st.student_id, st)
        continue
      }
      const currMillis =
        current.updated_at?.toMillis?.() ?? current.created_at?.toMillis?.() ?? 0
      const nextMillis = st.updated_at?.toMillis?.() ?? st.created_at?.toMillis?.() ?? 0
      if (nextMillis > currMillis) map.set(st.student_id, st)
    }
    return map
  }, [studentTrails])

  const visibleStudents = useMemo(() => {
    if (!selectedTrailId) return students
    return students.filter((s) => studentTrailByStudentId.has(s.id))
  }, [students, selectedTrailId, studentTrailByStudentId])

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db) {
        setLoadingInst(false)
        return
      }
      setLoadingInst(true)
      unsub = onSnapshot(
        collection(db, INSTITUTIONS_COLLECTION),
        (snap) => {
          setInstitutions(snap.docs.map(snapshotToInstitution))
          setInstError(null)
          setLoadingInst(false)
        },
        (err) => {
          setInstError(err.message)
          setLoadingInst(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [])

  useEffect(() => {
    let unsubStu: (() => void) | null = null
    let unsubTr: (() => void) | null = null
    let unsubStuTr: (() => void) | null = null

    async function run() {
      if (!db || !selectedId) {
        setStudents([])
        setTrails([])
        setStudentTrails([])
        setStudentsError(null)
        setTrailsError(null)
        setStudentTrailsError(null)
        setLoadingStudents(false)
        setLoadingTrails(false)
        setLoadingStudentTrails(false)
        return
      }

      setLoadingStudents(true)
      setLoadingTrails(true)
      setLoadingStudentTrails(true)

      const qStudents = query(
        collection(db, STUDENTS_COLLECTION),
        where('institution_id', '==', selectedId),
      )
      unsubStu = onSnapshot(
        qStudents,
        (snap) => {
          const list = snap.docs.map(snapshotToStudent)
          list.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'pt-BR', {
              sensitivity: 'base',
            }),
          )
          setStudents(list)
          setStudentsError(null)
          setLoadingStudents(false)
        },
        (err) => {
          setStudentsError(err.message)
          setStudents([])
          setLoadingStudents(false)
        },
      )

      const qTrails = query(
        collection(db, TRAILS_COLLECTION),
        where('institution_id', '==', selectedId),
      )
      unsubTr = onSnapshot(
        qTrails,
        (snap) => {
          const list = snap.docs.map(snapshotToTrail)
          list.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'pt-BR', {
              sensitivity: 'base',
            }),
          )
          setTrails(list)
          setTrailsError(null)
          setLoadingTrails(false)
        },
        (err) => {
          setTrailsError(err.message)
          setTrails([])
          setLoadingTrails(false)
        },
      )

      const qStudentTrails = selectedTrailId
        ? query(
            collection(db, STUDENT_TRAILS_COLLECTION),
            where('trail_id', '==', selectedTrailId),
          )
        : query(
            collection(db, STUDENT_TRAILS_COLLECTION),
            where('institution_id', '==', selectedId),
          )

      unsubStuTr = onSnapshot(
        qStudentTrails,
        (snap) => {
          const list = snap.docs.map(snapshotToStudentTrail)
          setStudentTrails(list)
          setStudentTrailsError(null)
          setLoadingStudentTrails(false)
        },
        (err) => {
          setStudentTrailsError(err.message)
          setStudentTrails([])
          setLoadingStudentTrails(false)
        },
      )
    }

    void run()
    return () => {
      unsubStu?.()
      unsubTr?.()
      unsubStuTr?.()
    }
  }, [selectedId, selectedTrailId])

  useEffect(() => {
    if (!selectedTrailId) return
    if (!trails.some((t) => t.id === selectedTrailId)) {
      setSelectedTrailId(null)
    }
  }, [selectedTrailId, trails])

  async function handleDeleteTrail(trail: Trail) {
    if (!db) return
    const label = trail.name?.trim() || trail.id
    const ok = window.confirm(
      `Excluir a trilha "${label}"? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return

    try {
      setDeletingTrailId(trail.id)
      await deleteDoc(doc(db, TRAILS_COLLECTION, trail.id))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir trilha.')
    } finally {
      setDeletingTrailId(null)
    }
  }

  useEffect(() => {
    if (!selectedId?.trim()) return
    window.localStorage.setItem(LAST_INSTITUTION_ID_STORAGE_KEY, selectedId)
  }, [selectedId])

  return (
    <>
      <header className="admin__header">
        <h1>Gerenciamento</h1>
        <p className="admin__lede muted">
          Escolha uma instituição para ver todos os alunos e todas as trilhas
          vinculados a ela.
        </p>
        <div className="gerenciamento-toolbar">
          <Link className="btn btn--ghost" to="/">
            ← Início
          </Link>
          <label className="gerenciamento-select">
            <span className="muted">Instituição</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => {
                const next = e.target.value.trim()
                setSelectedId(next || null)
                setSelectedTrailId(null)
              }}
              disabled={loadingInst || sortedInstitutions.length === 0}
            >
              <option value="">
                {loadingInst ? 'Carregando instituições…' : 'Selecione uma instituição'}
              </option>
              {sortedInstitutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name || inst.id}
                </option>
              ))}
            </select>
          </label>
          <label className="gerenciamento-select">
            <span className="muted">Trilha</span>
            <select
              value={selectedTrailId ?? ''}
              onChange={(e) => {
                const next = e.target.value.trim()
                setSelectedTrailId(next || null)
              }}
              disabled={!selectedId || loadingTrails || trails.length === 0}
            >
              <option value="">
                {!selectedId
                  ? 'Escolha a instituição primeiro'
                  : loadingTrails
                    ? 'Carregando trilhas…'
                    : 'Todas as trilhas'}
              </option>
              {trails.map((trail) => (
                <option key={trail.id} value={trail.id}>
                  {trail.name || trail.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {instError ? (
        <p className="banner banner--error" role="alert">
          {instError}
        </p>
      ) : null}

      {!selectedId ? (
        <section className="panel">
          <p className="muted gerenciamento-placeholder">
            Selecione uma instituição para ver os detalhes e as listas de alunos e
            trilhas.
          </p>
        </section>
      ) : (
        <>
          <div className="gerenciamento-layout">
            <section className="panel">
              <div className="panel__head">
                <h2>
                  {selectedInstitution?.name?.trim() || 'Instituição'}{' '}
                  <span className="muted gerenciamento-id">({selectedId})</span>
                </h2>
                <p className="admin__actions gerenciamento-detail-actions">
                  <Link
                    className="btn btn--small btn--ghost"
                    to={institutionPath(selectedId)}
                  >
                    Abrir cadastro
                  </Link>
                </p>
              </div>
              <dl className="gerenciamento-details">
                <div className="gerenciamento-details__row">
                  <dt>Tipo</dt>
                  <dd>{selectedInstitution?.type || '—'}</dd>
                </div>
                <div className="gerenciamento-details__row">
                  <dt>Ativa</dt>
                  <dd>{selectedInstitution?.active ? 'Sim' : 'Não'}</dd>
                </div>
                <div className="gerenciamento-details__row">
                  <dt>Criada em</dt>
                  <dd>{formatInstitutionTs(selectedInstitution?.created_at ?? null)}</dd>
                </div>
                <div className="gerenciamento-details__row">
                  <dt>Atualizada em</dt>
                  <dd>{formatInstitutionTs(selectedInstitution?.updated_at ?? null)}</dd>
                </div>
              </dl>
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>Trilhas</h2>
                <p className="admin__actions gerenciamento-detail-actions">
                  {loadingTrails ? <span className="muted">Carregando…</span> : null}
                  <Link
                    className="btn btn--small btn--primary"
                    to={
                      selectedId
                        ? `/trilhas/novo?institution_id=${encodeURIComponent(selectedId)}`
                        : '/trilhas/novo'
                    }
                  >
                    Criar Trilha
                  </Link>
                </p>
              </div>
              {trailsError ? (
                <p className="banner banner--error" role="alert">
                  {trailsError}
                </p>
              ) : null}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Disciplina</th>
                      <th>Ativa</th>
                      <th>Atualizada</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTrails ? (
                      <tr>
                        <td colSpan={5} className="muted table__empty">
                          Carregando trilhas…
                        </td>
                      </tr>
                    ) : trails.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted table__empty">
                          Nenhuma trilha nesta instituição.
                        </td>
                      </tr>
                    ) : (
                      trails.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link className="table__name-link" to={trailPath(t.id)}>
                              {t.name || '—'}
                            </Link>
                          </td>
                          <td>{t.subject || '—'}</td>
                          <td>{t.active ? 'Sim' : 'Não'}</td>
                          <td>{formatTrailTs(t.updated_at)}</td>
                          <td className="table__actions">
                            <Link className="btn btn--small btn--ghost" to={trailPath(t.id)}>
                              Abrir
                            </Link>
                            <button
                              type="button"
                              className="btn btn--small btn--danger"
                              onClick={() => void handleDeleteTrail(t)}
                              disabled={deletingTrailId === t.id}
                            >
                              {deletingTrailId === t.id ? 'Excluindo…' : 'Excluir'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="gerenciamento-bottom">
            <section className="panel">
              <div className="panel__head">
                <h2>Alunos</h2>
                {loadingStudents || loadingStudentTrails ? (
                  <span className="muted">Carregando…</span>
                ) : null}
              </div>
              {studentsError ? (
                <p className="banner banner--error" role="alert">
                  {studentsError}
                </p>
              ) : null}
              {studentTrailsError ? (
                <p className="banner banner--error" role="alert">
                  {studentTrailsError}
                </p>
              ) : null}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Trilha atual</th>
                      <th>Stage</th>
                      <th>Questão</th>
                      <th>Status</th>
                      <th>Telefone</th>
                      <th>Escolaridade</th>
                      <th>Nível pedagógico</th>
                      <th>Ativo</th>
                      <th>Criado em</th>
                      <th>Atualizado em</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStudents || loadingStudentTrails ? (
                      <tr>
                        <td colSpan={13} className="muted table__empty">
                          Carregando alunos…
                        </td>
                      </tr>
                    ) : visibleStudents.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="muted table__empty">
                          {selectedTrailId
                            ? 'Nenhum aluno com progresso nesta trilha.'
                            : 'Nenhum aluno nesta instituição.'}
                        </td>
                      </tr>
                    ) : (
                      visibleStudents.map((s) => {
                        const st = studentTrailByStudentId.get(s.id) ?? null
                        const trailLabel = st
                          ? trailNameById.get(st.trail_id) ?? st.trail_id
                          : '—'
                        return (
                        <tr key={s.id}>
                          <td>
                            <code>{s.id}</code>
                          </td>
                          <td>
                            <Link className="table__name-link" to={studentPath(s.id)}>
                              {s.name || '—'}
                            </Link>
                          </td>
                          <td>{trailLabel}</td>
                          <td>{st?.current_stage_number ?? '—'}</td>
                          <td>{st?.current_question_number ?? '—'}</td>
                          <td>{st ? <code>{st.status}</code> : '—'}</td>
                          <td>
                            {s.phone_number || '—'}
                          </td>
                          <td>
                            {s.school_grade || '—'} · {s.school_level}
                          </td>
                          <td>{s.student_level}</td>
                          <td>{s.active ? 'Sim' : 'Não'}</td>
                          <td>{formatStudentTs(s.created_at)}</td>
                          <td>{formatStudentTs(s.updated_at)}</td>
                          <td className="table__actions">
                            <Link className="btn btn--small btn--ghost" to={studentPath(s.id)}>
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}
