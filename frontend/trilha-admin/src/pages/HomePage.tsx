import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  formatInstitutionTs,
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import { fullInstitutionUrl, institutionPath } from '../lib/paths'
import { PRODUCTION_APP_ORIGIN } from '../lib/site'
import type { Institution } from '../types/institution'

export function HomePage() {
  const [items, setItems] = useState<Institution[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [items])

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db) {
        setLoadingList(false)
        return
      }

      setLoadingList(true)
      unsub = onSnapshot(
        collection(db, INSTITUTIONS_COLLECTION),
        (snap) => {
          setItems(snap.docs.map(snapshotToInstitution))
          setListError(null)
          setLoadingList(false)
        },
        (err) => {
          setListError(err.message)
          setLoadingList(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [])

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.alert('Não foi possível copiar. Copie manualmente.')
    }
  }

  function rowLink(inst: Institution): string {
    return fullInstitutionUrl(inst.id)
  }

  return (
    <>
      <header className="admin__header">
        <h1>Início — Instituições</h1>
        <p className="admin__lede">
          Cada registro tem um <strong>link fixo</strong> (gravado em{' '}
          <code>public_link</code> ao salvar). Em produção os links usam{' '}
          <a href={PRODUCTION_APP_ORIGIN} target="_blank" rel="noreferrer">
            {PRODUCTION_APP_ORIGIN.replace(/^https?:\/\//, '')}
          </a>
          . Outro domínio: variável <code>VITE_PUBLIC_APP_ORIGIN</code> no painel da
          Vercel.
        </p>
        <p className="admin__actions">
          <Link className="btn btn--primary" to="/instituicoes/novo">
            Nova instituição
          </Link>
        </p>
      </header>

      {listError ? (
        <p className="banner banner--error" role="alert">
          {listError}
        </p>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2>Todos os registros</h2>
          {loadingList ? <span className="muted">Carregando…</span> : null}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Ativa</th>
                <th>Link (URL)</th>
                <th>Criada em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.length === 0 && !loadingList ? (
                <tr>
                  <td colSpan={6} className="muted table__empty">
                    Nenhuma instituição cadastrada.
                  </td>
                </tr>
              ) : (
                sortedItems.map((row) => {
                  const url = rowLink(row)
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="table__name-link"
                          to={institutionPath(row.id)}
                        >
                          {row.name || '—'}
                        </Link>
                      </td>
                      <td>{row.type || '—'}</td>
                      <td>{row.active ? 'Sim' : 'Não'}</td>
                      <td className="table__link-cell">
                        <a
                          className="table__external-link"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {url}
                        </a>
                        <button
                          type="button"
                          className="btn btn--small btn--ghost table__copy"
                          onClick={() => copyLink(url)}
                          title="Copiar URL"
                        >
                          Copiar
                        </button>
                      </td>
                      <td>{formatInstitutionTs(row.created_at)}</td>
                      <td className="table__actions">
                        <Link
                          className="btn btn--small btn--ghost"
                          to={institutionPath(row.id)}
                        >
                          Abrir
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
    </>
  )
}
