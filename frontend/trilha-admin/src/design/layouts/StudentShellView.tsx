import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TrilhaPathIcon } from '../icons/trilha/TrilhaPathIcon'

export type StudentShellViewProps = {
  brandLabel?: string
  studentName?: string | null
  onLogout?: () => void
  children: ReactNode
  /** Quando false, esconde rail (ex. login). */
  showNav?: boolean
}

export function StudentShellView({
  brandLabel = 'Crias',
  studentName = null,
  onLogout,
  children,
  showNav = true,
}: StudentShellViewProps) {
  return (
    <div className="student-shell" data-shell="student">
      {showNav ? (
        <aside className="student-shell__rail">
          <Link to="/trilha" className="student-shell__brand">
            <span className="student-shell__brand-mark" aria-hidden="true" />
            <span className="student-shell__brand-text">{brandLabel}</span>
          </Link>
          <nav className="student-shell__nav" aria-label="Navegação do aluno">
            <Link
              to="/trilha"
              className="student-shell__nav-item is-active"
              aria-current="page"
            >
              <TrilhaPathIcon size={20} aria-hidden />
              <span>Trilha</span>
            </Link>
          </nav>
          <div className="student-shell__rail-foot">
            {studentName ? (
              <p className="student-shell__user muted">{studentName}</p>
            ) : null}
            {onLogout ? (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={onLogout}
              >
                Sair
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}

      <div className="student-shell__main">
        {showNav ? (
          <header className="student-shell__top">
            <Link to="/trilha" className="student-shell__top-brand">
              <TrilhaPathIcon size={24} title="Trilha" />
              <span>Trilha</span>
            </Link>
            {onLogout ? (
              <button
                type="button"
                className="btn btn--ghost btn--small student-shell__top-logout"
                onClick={onLogout}
              >
                Sair
              </button>
            ) : null}
          </header>
        ) : null}
        <main className="student-shell__content">{children}</main>
      </div>
    </div>
  )
}
