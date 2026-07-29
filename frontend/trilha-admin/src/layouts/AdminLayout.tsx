import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { NAV_ITEMS } from '../lib/adminPermissions'
import { AdminLayoutView } from '../design/layouts/AdminLayoutView'

/**
 * Shell visual autenticado (nav + área de conteúdo).
 * Lógica de permissão permanece nos hooks; a view só recebe props.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { canNav, permissionsLoading } = usePermissions()
  const authed = Boolean(user)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('crias-theme')
      return saved === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem('crias-theme', theme)
    } catch {
      // O tema continua funcionando mesmo se o navegador bloquear o storage.
    }
  }, [theme])

  const menuItems = NAV_ITEMS.filter((item) => canNav(item.key)).map((item) => ({
    key: item.key,
    path: item.path,
    label: item.label,
  }))

  return (
    <AdminLayoutView
      brandLabel="Crias Trilha"
      menuItems={menuItems}
      userEmail={user?.email ?? null}
      permissionsLoading={permissionsLoading}
      authed={authed}
      onLogout={() => void signOut()}
      theme={theme}
      onToggleTheme={() =>
        setTheme((current) => (current === 'light' ? 'dark' : 'light'))
      }
      guestLinks={[
        { path: '/doc', label: 'API / Doc' },
        { path: '/login', label: 'Entrar' },
      ]}
    >
      {children}
    </AdminLayoutView>
  )
}
