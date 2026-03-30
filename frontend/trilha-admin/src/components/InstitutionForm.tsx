import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { fullInstitutionUrl, institutionPath } from '../lib/paths'
import { PRODUCTION_APP_ORIGIN } from '../lib/site'
import { INSTITUTIONS_COLLECTION } from '../lib/institutionFirestore'
import type { Institution } from '../types/institution'

type Props = {
  /** Se ausente, modo criação. */
  docId?: string
  /** Dados atuais (modo edição); o pai mantém o listener do Firestore. */
  initial?: Institution
}

export function InstitutionForm({ docId, initial }: Props) {
  const navigate = useNavigate()
  const isEdit = Boolean(docId)

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    if (isEdit && initial) {
      setName(initial.name)
      setType(initial.type)
      setActive(initial.active)
    }
    if (!isEdit) {
      setName('')
      setType('')
      setActive(true)
    }
  }, [isEdit, initial])

  const publicUrl = docId ? fullInstitutionUrl(docId) : null

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2000)
    } catch {
      window.alert('Não foi possível copiar. Copie manualmente.')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) return
    const dbOk = db
    const trimmedName = name.trim()
    const trimmedType = type.trim()
    if (!trimmedName) {
      setFormError('Informe o nome da instituição.')
      return
    }
    if (!trimmedType) {
      setFormError('Informe o tipo (ex.: escola, cursinho, plataforma).')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (docId) {
        const link = fullInstitutionUrl(docId)
        await updateDoc(doc(dbOk, INSTITUTIONS_COLLECTION, docId), {
          name: trimmedName,
          type: trimmedType,
          active,
          updated_at: serverTimestamp(),
          public_link: link,
        })
      } else {
        // IDs sequenciais: i1, i2, i3...
        // Usa transação com contador em counters/institutions { next: number }.
        const newId = await runTransaction(dbOk, async (tx) => {
          const counterRef = doc(dbOk, 'counters', 'institutions')
          const counterSnap = await tx.get(counterRef)
          const data = counterSnap.exists() ? counterSnap.data() : {}
          const rawNext = (data as { next?: unknown }).next
          const next =
            typeof rawNext === 'number' && Number.isFinite(rawNext) && rawNext >= 1
              ? Math.floor(rawNext)
              : 1

          const instId = `i${next}`
          const instRef = doc(collection(dbOk, INSTITUTIONS_COLLECTION), instId)

          const existing = await tx.get(instRef)
          if (existing.exists()) {
            throw new Error(
              `Conflito ao gerar id sequencial (${instId}). Verifique counters/institutions.next.`,
            )
          }

          const link = fullInstitutionUrl(instId)
          tx.set(instRef, {
            name: trimmedName,
            type: trimmedType,
            active,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            public_link: link,
          })

          tx.set(counterRef, { next: next + 1 }, { merge: true })

          return instId
        })

        navigate(institutionPath(newId))
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!db || !docId || !initial) return
    const ok = window.confirm(
      `Excluir a instituição "${initial.name || docId}"? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return
    try {
      await deleteDoc(doc(db, INSTITUTIONS_COLLECTION, docId))
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  return (
    <section className="panel">
      <h2>{isEdit ? 'Editar instituição' : 'Nova instituição'}</h2>

      {publicUrl ? (
        <div className="public-link">
          <span className="public-link__label">Link deste registro</span>
          <div className="public-link__row">
            <a className="public-link__url" href={publicUrl}>
              {publicUrl}
            </a>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => copyLink(publicUrl)}
            >
              {copyDone ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="public-link__hint muted">
            O mesmo valor é gravado no Firestore no campo <code>public_link</code> ao
            salvar. Em produção o link costuma ser em{' '}
            <a href={PRODUCTION_APP_ORIGIN} target="_blank" rel="noreferrer">
              {PRODUCTION_APP_ORIGIN.replace(/^https?:\/\//, '')}
            </a>
            .
          </p>
        </div>
      ) : null}

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Escola Alpha"
            autoComplete="organization"
          />
        </label>
        <label className="field">
          <span>Tipo</span>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="escola, cursinho, plataforma…"
            list="institution-types"
          />
          <datalist id="institution-types">
            <option value="escola" />
            <option value="cursinho" />
            <option value="plataforma" />
          </datalist>
        </label>
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Instituição ativa</span>
        </label>
        {formError ? (
          <p className="form__error" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Incluir'}
          </button>
          {isEdit ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleDelete}
              disabled={saving}
            >
              Excluir
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}
