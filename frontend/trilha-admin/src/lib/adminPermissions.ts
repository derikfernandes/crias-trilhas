import type { AdminUser, NavPermission } from '../types/adminUser'

export const NAV_ITEMS: {
  key: NavPermission
  label: string
  path: string
}[] = [
  { key: 'home', label: 'Início', path: '/' },
  { key: 'institution_new', label: 'Nova instituição', path: '/instituicoes/novo' },
  { key: 'student_new', label: 'Novo aluno', path: '/alunos/novo' },
  { key: 'trail_new', label: 'Nova trilha', path: '/trilhas/novo' },
  { key: 'gerenciamento', label: 'Gerenciamento', path: '/gerenciamento' },
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'gabarito', label: 'Gabarito', path: '/gabarito' },
  { key: 'doc', label: 'API / Doc', path: '/doc' },
  { key: 'admin', label: 'Admin', path: '/admin' },
]

const ROUTE_NAV_MAP: { prefix: string; permission: NavPermission }[] = [
  { prefix: '/admin', permission: 'admin' },
  { prefix: '/instituicoes/novo', permission: 'institution_new' },
  { prefix: '/instituicoes/', permission: 'home' },
  { prefix: '/alunos/novo', permission: 'student_new' },
  { prefix: '/alunos/', permission: 'student_new' },
  { prefix: '/trilhas/novo', permission: 'trail_new' },
  { prefix: '/trilhas/', permission: 'trail_new' },
  { prefix: '/gerenciamento', permission: 'gerenciamento' },
  { prefix: '/dashboard', permission: 'dashboard' },
  { prefix: '/gabarito', permission: 'gabarito' },
  { prefix: '/doc', permission: 'doc' },
  { prefix: '/', permission: 'home' },
]

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function adminUserDocId(email: string): string {
  return normalizeAdminEmail(email).replace(/\./g, '_')
}

/** Sem registro em `admin_users`: mantém acesso total (compatibilidade). */
export function isUnrestrictedAccess(profile: AdminUser | null): boolean {
  return profile === null
}

export function hasFullAccess(profile: AdminUser | null): boolean {
  if (isUnrestrictedAccess(profile)) return true
  return Boolean(profile?.active && profile.is_super_admin)
}

export function canAccessNav(
  profile: AdminUser | null,
  permission: NavPermission,
): boolean {
  if (profile === null) return true
  if (!profile.active) return false
  if (profile.is_super_admin) return true
  return profile.nav_permissions.includes(permission)
}

export function canAccessInstitution(
  profile: AdminUser | null,
  institutionId: string,
): boolean {
  if (profile === null) return true
  if (!profile.active) return false
  if (profile.is_super_admin || profile.all_institutions) return true
  return profile.institution_ids.includes(institutionId)
}

export function filterInstitutionsByAccess<T extends { id: string }>(
  profile: AdminUser | null,
  items: T[],
): T[] {
  if (profile === null) return items
  if (!profile.active) return []
  if (profile.is_super_admin || profile.all_institutions) return items
  const allowed = new Set(profile.institution_ids)
  return items.filter((item) => allowed.has(item.id))
}

export function navPermissionForPath(pathname: string): NavPermission {
  const path = pathname.replace(/\/$/, '') || '/'
  for (const entry of ROUTE_NAV_MAP) {
    if (entry.prefix === '/') {
      if (path === '/') return entry.permission
      continue
    }
    if (path === entry.prefix || path.startsWith(`${entry.prefix}`)) {
      return entry.permission
    }
  }
  return 'home'
}

export function defaultNavPermissions(): NavPermission[] {
  return NAV_ITEMS.map((item) => item.key).filter((key) => key !== 'admin')
}
