import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
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
  formatTrailTs,
  snapshotToTrail,
  TRAILS_COLLECTION,
} from '../lib/trailFirestore'
import { institutionPath, studentPath, trailPath } from '../lib/paths'
import type { Institution } from '../types/institution'
import type { Student } from '../types/student'
import type { Trail } from '../types/trail'

export function GerenciamentoPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loadingInst, setLoadingInst] = useState(true)
  const [instError, setInstError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)

  const [trails, setTrails] = useState<Trail[]>([])
  const [loadingTrails, setLoadingTrails] = useState(false)
  const [trailsError, setTrailsError] = useState<string | null>(null)

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

    async function run() {
      if (!db || !selectedId) {
        setStudents([])
        setTrails([])
        setStudentsError(null)
        setTrailsError(null)
        setLoadingStudents(false)
        setLoadingTrails(false)
        return
      }

      setLoadingStudents(true)
      setLoadingTrails(true)

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
    }

    void run()
    return () => {
      unsubStu?.()
      unsubTr?.()
    }
  }, [selectedId])

  return (
    <>
      <header className="admin__header">
        <h1>Gerenciamento</h1>
        <p className="admin__lede muted">
          Escolha uma instituição para ver todos os alunos e todas as trilhas
          vinculados a ela.
        </p>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/">
            ← Início
          </Link>
        </p>
      </header>

      {instError ? (
        <p className="banner banner--error" role="alert">
          {instError}
        </p>
      ) : null}

      <div className="gerenciamento-layout">
        <section className="panel">
          <div className="panel__head">
            <h2>Instituições</h2>
            {loadingInst ? <span className="muted">Carregando…</span> : null}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Ativa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedInstitutions.length === 0 && !loadingInst ? (
                  <tr>
                    <td colSpan={4} className="muted table__empty">
                      Nenhuma instituição cadastrada.
                    </td>
                  </tr>
                ) : (
                  sortedInstitutions.map((row) => {
                    const isSel = row.id === selectedId
                    return (
                      <tr
                        key={row.id}
                        className={isSel ? 'gerenciamento-row--selected' : undefined}
                      >
                        <td>
                          <button
                            type="button"
                            className="table__name-link table__name-link--button"
                            onClick={() => setSelectedId(row.id)}
                          >
                            {row.name || '—'}
                          </button>
                        </td>
                        <td>{row.type || '—'}</td>
                        <td>{row.active ? 'Sim' : 'Não'}</td>
                        <td className="table__actions">
                          <Link
                            className="btn btn--small btn--ghost"
                            to={institutionPath(row.id)}
                          >
                            Editar
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          {!selectedId ? (
            <>
              <div className="panel__head">
                <h2>Alunos e trilhas</h2>
              </div>
              <p className="muted gerenciamento-placeholder">
                Clique no nome de uma instituição na lista para carregar alunos e
                trilhas.
              </p>
            </>
          ) : (
            <>
              <div className="panel__head">
                <h2>
                  {selectedInstitution?.name?.trim() || 'Instituição'}{' '}
                  <span className="muted gerenciamento-id">({selectedId})</span>
                </h2>
                <p className="admin__actions gerenciamento-detail-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setSelectedId(null)}
                  >
                    Limpar seleção
                  </button>
                  <Link
                    className="btn btn--small btn--ghost"
                    to={institutionPath(selectedId)}
                  >
                    Abrir cadastro
                  </Link>
                </p>
              </div>

              <p className="muted gerenciamento-meta">
                Criada em{' '}
                {formatInstitutionTs(selectedInstitution?.created_at ?? null)}
              </p>

              <h3 className="gerenciamento-subhead">Alunos</h3>
              {studentsError ? (
                <p className="banner banner--error" role="alert">
                  {studentsError}
                </p>
              ) : null}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Série / nível</th>
                      <th>Ativo</th>
                      <th>Cadastro</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStudents ? (
                      <tr>
                        <td colSpan={5} className="muted table__empty">
                          Carregando alunos…
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted table__empty">
                          Nenhum aluno nesta instituição.
                        </td>
                      </tr>
                    ) : (
                      students.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link
                              className="table__name-link"
                              to={studentPath(s.id)}
                            >
                              {s.name || '—'}
                            </Link>
                          </td>
                          <td>
                            {s.school_grade || '—'} · {s.school_level}
                          </td>
                          <td>{s.active ? 'Sim' : 'Não'}</td>
                          <td>{formatStudentTs(s.created_at)}</td>
                          <td className="table__actions">
                            <Link
                              className="btn btn--small btn--ghost"
                              to={studentPath(s.id)}
                            >
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h3 className="gerenciamento-subhead">Trilhas</h3>
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
                            <Link
                              className="table__name-link"
                              to={trailPath(t.id)}
                            >
                              {t.name || '—'}
                            </Link>
                          </td>
                          <td>{t.subject || '—'}</td>
                          <td>{t.active ? 'Sim' : 'Não'}</td>
                          <td>{formatTrailTs(t.updated_at)}</td>
                          <td className="table__actions">
                            <Link
                              className="btn btn--small btn--ghost"
                              to={trailPath(t.id)}
                            >
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}
