import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { INSTITUTIONS_COLLECTION } from '../lib/institutionFirestore'
import { TRAILS_COLLECTION } from '../lib/trailFirestore'
import { trailPath } from '../lib/paths'
import type { Trail } from '../types/trail'

type Props = {
  /** Se ausente, modo criação. */
  docId?: string
  /** Dados atuais (modo edição); o pai mantém o listener do Firestore. */
  initial?: Trail
}

const DEFAULT_STEPS = 8

function sanitizeStepsInt(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

function trimRequiredString(v: string): string | null {
  const s = v.trim()
  return s.length ? s : null
}

export function TrailForm({ docId, initial }: Props) {
  const navigate = useNavigate()
  const isEdit = Boolean(docId)

  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([])

  const [institution_id, setInstitutionId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [default_total_steps_per_stage, setDefaultTotalStepsPerStage] =
    useState(String(DEFAULT_STEPS))
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const parsedSteps = useMemo(
    () => sanitizeStepsInt(default_total_steps_per_stage),
    [default_total_steps_per_stage],
  )

  useEffect(() => {
    // Carrega instituições para montar o select de vínculo.
    if (!db) return
    const unsub = onSnapshot(collection(db, INSTITUTIONS_COLLECTION), (snap) => {
      const next = snap.docs.map((d) => {
        const data = d.data()
        const nm = typeof (data as Record<string, unknown>).name === 'string'
          ? ((data as Record<string, unknown>).name as string)
          : ''
        return { id: d.id, name: nm }
      })

      next.sort((a, b) => a.name.localeCompare(b.name))
      setInstitutions(next)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isEdit) {
      setInstitutionId('')
      setName('')
      setDescription('')
      setSubject('')
      setDefaultTotalStepsPerStage(String(DEFAULT_STEPS))
      setActive(true)
      return
    }

    if (!initial) return
    setInstitutionId(initial.institution_id)
    setName(initial.name)
    setDescription(initial.description)
    setSubject(initial.subject)
    setDefaultTotalStepsPerStage(
      String(initial.default_total_steps_per_stage ?? DEFAULT_STEPS),
    )
    setActive(initial.active)
  }, [isEdit, initial])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) return
    const dbOk = db

    const instId = institution_id.trim()
    const trimmedName = trimRequiredString(name)
    const trimmedDescription = trimRequiredString(description)
    const trimmedSubject = trimRequiredString(subject)

    if (!instId) {
      setFormError('Informe a instituição (vínculo obrigatório).')
      return
    }
    if (!trimmedName) {
      setFormError('Informe o nome da trilha.')
      return
    }
    if (!trimmedDescription) {
      setFormError('Informe a descrição geral da trilha.')
      return
    }
    if (!trimmedSubject) {
      setFormError('Informe a matéria/tema principal da trilha.')
      return
    }
    if (parsedSteps === null) {
      setFormError('default_total_steps_per_stage deve ser um inteiro.')
      return
    }
    if (parsedSteps < 0) {
      setFormError('default_total_steps_per_stage não pode ser negativo.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (docId) {
        await updateDoc(doc(dbOk, TRAILS_COLLECTION, docId), {
          institution_id: instId,
          name: trimmedName,
          description: trimmedDescription,
          subject: trimmedSubject,
          default_total_steps_per_stage: parsedSteps,
          active,
          updated_at: serverTimestamp(),
        })
      } else {
        // IDs sequenciais: t1, t2, t3...
        // Usa transação com contador em counters/trails { next: number }.
        const newId = await runTransaction(dbOk, async (tx) => {
          const counterRef = doc(dbOk, 'counters', 'trails')
          const counterSnap = await tx.get(counterRef)
          const data = counterSnap.exists() ? counterSnap.data() : {}
          const rawNext = (data as { next?: unknown }).next
          const next =
            typeof rawNext === 'number' && Number.isFinite(rawNext) && rawNext >= 1
              ? Math.floor(rawNext)
              : 1

          const trailId = `t${next}`
          const trailRef = doc(collection(dbOk, TRAILS_COLLECTION), trailId)

          const existing = await tx.get(trailRef)
          if (existing.exists()) {
            throw new Error(
              `Conflito ao gerar id sequencial (${trailId}). Verifique counters/trails.next.`,
            )
          }

          tx.set(trailRef, {
            institution_id: instId,
            name: trimmedName,
            description: trimmedDescription,
            subject: trimmedSubject,
            default_total_steps_per_stage: parsedSteps,
            active,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          })

          tx.set(counterRef, { next: next + 1 }, { merge: true })

          return trailId
        })

        navigate(trailPath(newId))
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
      `Excluir a trilha "${initial.name || docId}"? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return

    try {
      await deleteDoc(doc(db, TRAILS_COLLECTION, docId))
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  return (
    <section className="panel">
      <h2>{isEdit ? 'Editar trilha' : 'Nova trilha'}</h2>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Instituição</span>
          <select
            value={institution_id}
            onChange={(e) => setInstitutionId(e.target.value)}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name ? `${inst.name} (${inst.id})` : inst.id}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Trilha de Matemática Básica"
            autoComplete="organization"
          />
        </label>

        <label className="field">
          <span>Matéria/Tema principal (subject)</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex.: Matemática"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Descrição geral (description)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Descreva a trilha em nível macro..."
          />
        </label>

        <label className="field">
          <span>
            Passos por stage (default_total_steps_per_stage)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={default_total_steps_per_stage}
            onChange={(e) => setDefaultTotalStepsPerStage(e.target.value)}
          />
          <span className="muted">
            Valor padrão que você pode customizar depois (default {DEFAULT_STEPS})
          </span>
        </label>

        <label className="field field--inline">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Trilha ativa</span>
        </label>

        {formError ? (
          <p className="form__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving}
          >
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

