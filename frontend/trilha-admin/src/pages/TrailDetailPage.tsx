import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { TRAILS_COLLECTION, snapshotToTrail } from '../lib/trailFirestore'
import { TrailForm } from '../components/TrailForm'
import type { Trail } from '../types/trail'

export function TrailDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [trail, setTrail] = useState<Trail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <TrailForm docId={id} initial={trail} />
      )}
    </>
  )
}

