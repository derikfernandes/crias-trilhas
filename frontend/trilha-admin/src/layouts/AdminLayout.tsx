import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import {
  navPermissionForPath,
  SIDEBAR_NAV,
  type SidebarNavEntry,
} from '../lib/adminPermissions'
import { getAppVersion } from '../lib/appVersion'
import { HELP_MAILTO } from '../lib/site'
import {
  AdminLayoutView,
  type AdminLayoutNavEntry,
} from '../design/layouts/AdminLayoutView'

/**
 * Shell visual autenticado (header topo + área de conteúdo).
 * Lógica de permissão permanece nos hooks; a view só recebe props.
 * Rótulos Visão geral / Trilhas / Alunos são aplicados na view; rotas intactas.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { canNav, permissionsLoading, adminProfile } = usePermissions()
  const location = useLocation()
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

  const navEntries = useMemo(() => {
    const activePermission = navPermissionForPath(location.pathname)
    const entries: AdminLayoutNavEntry[] = []

    for (const entry of SIDEBAR_NAV as SidebarNavEntry[]) {
      if (entry.type === 'link') {
        if (!canNav(entry.key)) continue
        entries.push({
          type: 'link',
          key: entry.key,
          path: entry.path,
          label: entry.label,
          active: activePermission === entry.key,
        })
        continue
      }

      const childrenItems = entry.children
        .filter((child) => canNav(child.key))
        .map((child) => ({
          key: child.key,
          path: child.path,
          label: child.label,
          active: activePermission === child.key,
        }))

      if (childrenItems.length === 0) continue

      entries.push({
        type: 'group',
        id: entry.id,
        label: entry.label,
        children: childrenItems,
      })
    }

    return entries
  }, [canNav, location.pathname])

  const userRoleLabel = useMemo(() => {
    if (!adminProfile) return 'Acesso completo'
    if (adminProfile.is_super_admin) return 'Super admin'
    if (!adminProfile.active) return 'Inativo'
    const nav = adminProfile.nav_permissions ?? []
    if (nav.includes('admin') && nav.includes('dashboard')) {
      return 'Coordenação'
    }
    if (nav.length > 0 && !nav.includes('admin')) {
      return 'Leitura'
    }
    return 'Usuário'
  }, [adminProfile])

  return (
    <AdminLayoutView
      brandLabel="Crias Trilha"
      navEntries={navEntries}
      userEmail={user?.email ?? null}
      userRoleLabel={userRoleLabel}
      permissionsLoading={permissionsLoading}
      authed={authed}
      onLogout={() => void signOut()}
      theme={theme}
      onToggleTheme={() =>
        setTheme((current) => (current === 'light' ? 'dark' : 'light'))
      }
      helpMailto={HELP_MAILTO}
      appVersion={getAppVersion()}
      guestLinks={[
        { path: '/doc', label: 'API e documentação' },
        { path: '/login', label: 'Entrar' },
      ]}
      manageInstitutionsHref="/"
    >
      {children}
    </AdminLayoutView>
  )
}
