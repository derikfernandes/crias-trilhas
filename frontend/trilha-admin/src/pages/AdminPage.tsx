import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  adminUserDocId,
  defaultNavPermissions,
  NAV_ITEMS,
  normalizeAdminEmail,
} from '../lib/adminPermissions'
import {
  ADMIN_USERS_COLLECTION,
  snapshotToAdminUser,
} from '../lib/adminUserFirestore'
import {
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import { usePermissions } from '../hooks/usePermissions'
import type { AdminUser, NavPermission } from '../types/adminUser'
import type { Institution } from '../types/institution'

type FormState = {
  email: string
  active: boolean
  is_super_admin: boolean
  all_institutions: boolean
  nav_permissions: NavPermission[]
  institution_ids: string[]
}

function emptyForm(): FormState {
  return {
    email: '',
    active: true,
    is_super_admin: false,
    all_institutions: false,
    nav_permissions: defaultNavPermissions(),
    institution_ids: [],
  }
}

function formFromUser(user: AdminUser): FormState {
  return {
    email: user.email,
    active: user.active,
    is_super_admin: user.is_super_admin,
    all_institutions: user.all_institutions,
    nav_permissions: [...user.nav_permissions],
    institution_ids: [...user.institution_ids],
  }
}

export function AdminPage() {
  const { canNav, permissionsLoading } = usePermissions()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.email.localeCompare(b.email, 'pt-BR'))
  }, [users])

  const sortedInstitutions = useMemo(() => {
    return [...institutions].sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR', {
        sensitivity: 'base',
      }),
    )
  }, [institutions])

  useEffect(() => {
    if (!db) {
      setLoadingUsers(false)
      return
    }

    const unsubUsers = onSnapshot(
      collection(db, ADMIN_USERS_COLLECTION),
      (snap) => {
        setUsers(snap.docs.map(snapshotToAdminUser))
        setListError(null)
        setLoadingUsers(false)
      },
      (err) => {
        const message = err.message
        if (/permission/i.test(message)) {
          setListError(
            'Permissão negada no Firestore. Publique as regras do arquivo firestore.rules (Firebase Console → Firestore → Regras).',
          )
        } else {
          setListError(message)
        }
        setLoadingUsers(false)
      },
    )

    const unsubInst = onSnapshot(collection(db, INSTITUTIONS_COLLECTION), (snap) => {
      setInstitutions(snap.docs.map(snapshotToInstitution))
    })

    return () => {
      unsubUsers()
      unsubInst()
    }
  }, [])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
  }

  function startEdit(user: AdminUser) {
    setEditingId(user.id)
    setForm(formFromUser(user))
    setFormError(null)
  }

  function toggleNav(key: NavPermission) {
    setForm((prev) => {
      const has = prev.nav_permissions.includes(key)
      return {
        ...prev,
        nav_permissions: has
          ? prev.nav_permissions.filter((item) => item !== key)
          : [...prev.nav_permissions, key],
      }
    })
  }

  function toggleInstitution(id: string) {
    setForm((prev) => {
      const has = prev.institution_ids.includes(id)
      return {
        ...prev,
        institution_ids: has
          ? prev.institution_ids.filter((item) => item !== id)
          : [...prev.institution_ids, id],
      }
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) return

    const email = normalizeAdminEmail(form.email)
    if (!email || !email.includes('@')) {
      setFormError('Informe um e-mail válido (o mesmo usado no login Firebase).')
      return
    }

    if (
      !form.is_super_admin &&
      !form.all_institutions &&
      form.institution_ids.length === 0
    ) {
      setFormError(
        'Selecione ao menos uma instituição ou marque "Todas as instituições".',
      )
      return
    }

    if (!form.is_super_admin && form.nav_permissions.length === 0) {
      setFormError('Selecione ao menos um tópico do menu ou marque Super admin.')
      return
    }

    const docId = editingId ?? adminUserDocId(email)
    setSaving(true)
    setFormError(null)

    try {
      const payload = {
        email,
        active: form.active,
        is_super_admin: form.is_super_admin,
        all_institutions: form.is_super_admin ? true : form.all_institutions,
        nav_permissions: form.is_super_admin
          ? NAV_ITEMS.map((item) => item.key)
          : form.nav_permissions,
        institution_ids: form.is_super_admin || form.all_institutions ? [] : form.institution_ids,
        updated_at: serverTimestamp(),
      }

      if (editingId) {
        await updateDoc(doc(db, ADMIN_USERS_COLLECTION, docId), payload)
      } else {
        await setDoc(doc(db, ADMIN_USERS_COLLECTION, docId), {
          ...payload,
          created_at: serverTimestamp(),
        })
      }

      setEditingId(docId)
      setForm((prev) => ({ ...prev, email }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar.'
      if (/permission/i.test(message)) {
        setFormError(
          'Permissão negada no Firestore. Publique as regras do arquivo firestore.rules na raiz do projeto (Firebase Console → Firestore → Regras, ou firebase deploy --only firestore:rules).',
        )
      } else {
        setFormError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!db) return
    const ok = window.confirm(`Remover permissões de ${user.email}?`)
    if (!ok) return

    setDeletingId(user.id)
    try {
      await deleteDoc(doc(db, ADMIN_USERS_COLLECTION, user.id))
      if (editingId === user.id) {
        startCreate()
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao remover.')
    } finally {
      setDeletingId(null)
    }
  }

  if (permissionsLoading) {
    return <p className="muted">Carregando permissões…</p>
  }

  if (!canNav('admin')) {
    return (
      <p className="banner banner--error" role="alert">
        Você não tem permissão para acessar o painel de administração.
      </p>
    )
  }

  return (
    <>
      <header className="admin__header">
        <h1>Admin — permissões por login</h1>
        <p className="admin__lede">
          Defina quais tópicos do menu cada e-mail pode ver e quais instituições
          ele pode acessar. O e-mail deve ser o mesmo da conta Firebase Auth.
          Logins <strong>sem registro aqui</strong> continuam com acesso total
          até você configurá-los.
        </p>
      </header>

      {listError ? (
        <p className="banner banner--error" role="alert">
          {listError}
        </p>
      ) : null}

      <div className="admin-permissions">
        <section className="panel admin-permissions__form-panel">
          <div className="panel__head">
            <h2>{editingId ? 'Editar login' : 'Novo login'}</h2>
            {editingId ? (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={startCreate}
              >
                Cancelar edição
              </button>
            ) : null}
          </div>

          <form className="form admin-permissions__form" onSubmit={handleSubmit}>
            <label className="field">
              <span>E-mail do login</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="usuario@escola.com"
                disabled={Boolean(editingId)}
                required
              />
            </label>

            <label className="field field--inline">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, active: e.target.checked }))
                }
              />
              <span>Login ativo</span>
            </label>

            <label className="field field--inline">
              <input
                type="checkbox"
                checked={form.is_super_admin}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    is_super_admin: e.target.checked,
                    all_institutions: e.target.checked ? true : prev.all_institutions,
                  }))
                }
              />
              <span>Super admin (acesso total)</span>
            </label>

            {!form.is_super_admin ? (
              <>
                <fieldset className="admin-permissions__fieldset">
                  <legend>Tópicos do menu</legend>
                  <div className="admin-permissions__checks">
                    {NAV_ITEMS.map((item) => (
                      <label key={item.key} className="field field--inline">
                        <input
                          type="checkbox"
                          checked={form.nav_permissions.includes(item.key)}
                          onChange={() => toggleNav(item.key)}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="field field--inline">
                  <input
                    type="checkbox"
                    checked={form.all_institutions}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        all_institutions: e.target.checked,
                        institution_ids: e.target.checked ? [] : prev.institution_ids,
                      }))
                    }
                  />
                  <span>Todas as instituições</span>
                </label>

                {!form.all_institutions ? (
                  <fieldset className="admin-permissions__fieldset">
                    <legend>Instituições permitidas</legend>
                    {sortedInstitutions.length === 0 ? (
                      <p className="muted">Nenhuma instituição cadastrada.</p>
                    ) : (
                      <div className="admin-permissions__checks">
                        {sortedInstitutions.map((inst) => (
                          <label key={inst.id} className="field field--inline">
                            <input
                              type="checkbox"
                              checked={form.institution_ids.includes(inst.id)}
                              onChange={() => toggleInstitution(inst.id)}
                            />
                            <span>
                              {inst.name || inst.id}{' '}
                              <span className="muted">({inst.id})</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : null}
              </>
            ) : null}

            {formError ? (
              <p className="form__error" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar login'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Logins configurados</h2>
            {loadingUsers ? <span className="muted">Carregando…</span> : null}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Ativo</th>
                  <th>Escopo</th>
                  <th>Menu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 && !loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="muted table__empty">
                      Nenhum login configurado. Adicione o primeiro ao lado.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.active ? 'Sim' : 'Não'}</td>
                      <td>
                        {user.is_super_admin
                          ? 'Super admin'
                          : user.all_institutions
                            ? 'Todas instituições'
                            : `${user.institution_ids.length} instituição(ões)`}
                      </td>
                      <td>
                        {user.is_super_admin
                          ? 'Todos'
                          : user.nav_permissions.length > 0
                            ? user.nav_permissions.length
                            : '—'}
                      </td>
                      <td className="table__actions">
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          onClick={() => startEdit(user)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          onClick={() => void handleDelete(user)}
                          disabled={deletingId === user.id}
                        >
                          {deletingId === user.id ? 'Removendo…' : 'Remover'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
