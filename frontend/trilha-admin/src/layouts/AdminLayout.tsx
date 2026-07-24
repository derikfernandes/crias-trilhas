import type { ReactNode } from 'react'
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
      guestLinks={[
        { path: '/doc', label: 'API / Doc' },
        { path: '/login', label: 'Entrar' },
      ]}
    >
      {children}
    </AdminLayoutView>
  )
}
