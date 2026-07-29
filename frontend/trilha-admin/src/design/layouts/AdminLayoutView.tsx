import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type AdminLayoutMenuItem = {
  key: string
  path: string
  label: string
}

export type AdminLayoutGuestLink = {
  path: string
  label: string
}

export type AdminLayoutViewProps = {
  brandLabel: string
  menuItems: AdminLayoutMenuItem[]
  userEmail: string | null
  permissionsLoading: boolean
  authed: boolean
  onLogout: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  children: ReactNode
  guestLinks: AdminLayoutGuestLink[]
}

export function AdminLayoutView({
  brandLabel,
  menuItems,
  userEmail,
  permissionsLoading,
  authed,
  onLogout,
  theme,
  onToggleTheme,
  children,
  guestLinks,
}: AdminLayoutViewProps) {
  return (
    <div className="admin">
      <nav className="nav">
        <Link to="/" className="nav__brand">
          {brandLabel}
        </Link>
        <div className="nav__links">
          {authed ? (
            <>
              {permissionsLoading ? (
                <span className="muted">Carregando menu…</span>
              ) : (
                menuItems.map((item) => (
                  <Link key={item.key} to={item.path}>
                    {item.label}
                  </Link>
                ))
              )}
              <span className="nav__user muted">{userEmail}</span>
              <button
                type="button"
                className="nav__logout btn btn--ghost btn--small"
                onClick={onLogout}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              {guestLinks.map((link) => (
                <Link key={link.path} to={link.path}>
                  {link.label}
                </Link>
              ))}
            </>
          )}
          <button
            type="button"
            className="nav__theme btn btn--ghost btn--small"
            aria-label={
              theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'
            }
            title={
              theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'
            }
            onClick={onToggleTheme}
          >
            {theme === 'light' ? '🌙 Modo escuro' : '☀️ Modo claro'}
          </button>
        </div>
      </nav>
      {children}
    </div>
  )
}
