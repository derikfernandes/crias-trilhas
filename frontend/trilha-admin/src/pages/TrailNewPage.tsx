import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { TrailForm } from '../components/TrailForm'
import { db } from '../lib/firebase'
import { INSTITUTIONS_COLLECTION } from '../lib/institutionFirestore'

const LAST_INSTITUTION_ID_STORAGE_KEY = 'trilha_admin_selected_institution_id'

export function TrailNewPage() {
  const [searchParams] = useSearchParams()
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([])

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
      next.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
      setInstitutions(next)
    })

    return () => unsub()
  }, [])

  const effectiveInstitutionId = useMemo(() => {
    const fromQuery = (searchParams.get('institution_id') ?? '').trim()
    if (fromQuery) return fromQuery

    const fromStorage = window.localStorage
      .getItem(LAST_INSTITUTION_ID_STORAGE_KEY)
      ?.trim()
    if (fromStorage) return fromStorage

    return institutions.length === 1 ? institutions[0].id : ''
  }, [institutions, searchParams])

  useEffect(() => {
    if (!effectiveInstitutionId) return
    window.localStorage.setItem(LAST_INSTITUTION_ID_STORAGE_KEY, effectiveInstitutionId)
  }, [effectiveInstitutionId])

  const selectedInstitution = useMemo(
    () => institutions.find((i) => i.id === effectiveInstitutionId) ?? null,
    [effectiveInstitutionId, institutions],
  )

  return (
    <>
      <header className="admin__header">
        <div className="trail-new-header__top-row">
          <p className="trail-new-header__left">
            <Link className="btn btn--ghost" to="/gerenciamento">
              ← Gerenciamento
            </Link>
          </p>
          <h1 className="trail-new-header__title">Nova trilha</h1>
          <p className="trail-new-header__institution muted">
            {effectiveInstitutionId
              ? `${selectedInstitution?.name?.trim() || 'Sem nome'} (${effectiveInstitutionId})`
              : 'não selecionada'}
          </p>
        </div>
      </header>
      {effectiveInstitutionId ? (
        <TrailForm fixedInstitutionId={effectiveInstitutionId} />
      ) : (
        <section className="panel">
          <p className="banner banner--error" role="alert">
            Selecione uma instituição em Gerenciamento para criar a trilha.
          </p>
        </section>
      )}
    </>
  )
}

