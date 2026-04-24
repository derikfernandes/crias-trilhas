import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import { InstitutionForm } from '../components/InstitutionForm'
import type { Institution } from '../types/institution'

export function InstitutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [inst, setInst] = useState<Institution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db || !id) {
        setLoading(false)
        return
      }

      setLoading(true)
      unsub = onSnapshot(
        doc(db, INSTITUTIONS_COLLECTION, id),
        (snap) => {
          if (!snap.exists()) {
            setInst(null)
            setError(null)
          } else {
            setInst(snapshotToInstitution(snap))
            setError(null)
          }
          setLoading(false)
        },
        (err) => {
          setError(err.message)
          setLoading(false)
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
        <h1>Instituição</h1>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/gerenciamento">
            ← Gerenciamento
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
      ) : !inst ? (
        <p className="banner banner--error" role="alert">
          Registro não encontrado.
        </p>
      ) : (
        <InstitutionForm docId={id} initial={inst} />
      )}
    </>
  )
}
