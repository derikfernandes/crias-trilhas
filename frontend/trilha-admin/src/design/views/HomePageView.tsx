import { Link } from 'react-router-dom'
import type { HomePageViewProps } from '../types/homePageView'

export type { HomePageInstitutionRow, HomePageViewProps } from '../types/homePageView'

export function HomePageView({
  productionOriginLabel,
  productionOriginHref,
  canCreate,
  rows,
  loading,
  error,
  onCopyLink,
}: HomePageViewProps) {
  return (
    <>
      <header className="admin__header">
        <h1>Início — Instituições</h1>
        <p className="admin__lede">
          Cada registro tem um <strong>link fixo</strong> (gravado em{' '}
          <code>public_link</code> ao salvar). Em produção os links usam{' '}
          <a href={productionOriginHref} target="_blank" rel="noreferrer">
            {productionOriginLabel}
          </a>
          . Outro domínio: variável <code>VITE_PUBLIC_APP_ORIGIN</code> no painel da
          Vercel.
        </p>
        <p className="admin__actions">
          {canCreate ? (
            <Link className="btn btn--primary" to="/instituicoes/novo">
              Nova instituição
            </Link>
          ) : null}
        </p>
      </header>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2>Todos os registros</h2>
          {loading ? <span className="muted">Carregando…</span> : null}
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
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="muted table__empty">
                    Nenhuma instituição cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="table__name-link"
                        to={row.detailHref}
                      >
                        {row.name || '—'}
                      </Link>
                    </td>
                    <td>{row.type || '—'}</td>
                    <td>{row.activeLabel}</td>
                    <td className="table__link-cell">
                      <a
                        className="table__external-link"
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.url}
                      </a>
                      <button
                        type="button"
                        className="btn btn--small btn--ghost table__copy"
                        onClick={() => onCopyLink(row.url)}
                        title="Copiar URL"
                      >
                        Copiar
                      </button>
                    </td>
                    <td>{row.createdAtLabel}</td>
                    <td className="table__actions">
                      <Link
                        className="btn btn--small btn--ghost"
                        to={row.detailHref}
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
      </section>
    </>
  )
}
