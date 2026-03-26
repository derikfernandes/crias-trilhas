import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { STUDENTS_COLLECTION, snapshotToStudent } from '../lib/studentFirestore'
import { StudentForm } from '../components/StudentForm'
import type { Student } from '../types/student'

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [stu, setStu] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    </>
  )
}

