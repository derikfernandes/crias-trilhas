import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { deleteDoc, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  TRAIL_STAGES_COLLECTION,
  trailStageDocId,
} from '../lib/trailStageFirestore'
import type { TrailStage } from '../types/trailStage'

type Props = {
  trailId: string
  /** Se presente, modo edição. */
  docId?: string
  /** Dados atuais (necessários no modo edição). */
  initial?: TrailStage
  /** Usado como sugestão no modo criação. */
  suggestedStageNumber?: number
  onCancel?: () => void
  onSaved?: () => void
}

function parseStageNumberInt(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null
  return n
}

export function TrailStageForm({
  trailId,
  docId,
  initial,
  suggestedStageNumber,
  onCancel,
  onSaved,
}: Props) {
  const isEdit = Boolean(docId)

  const [stageNumber, setStageNumber] = useState<number>(
    suggestedStageNumber ?? 1,
  )
  const stageNumberLabel = useMemo(
    () => `Stage #${stageNumber}`,
    [stageNumber],
  )
  const [title, setTitle] = useState('')
  const [isReleased, setIsReleased] = useState(false)
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (isEdit) {
      if (!initial) {
        // Mantém campos "vazios" até o pai passar o initial correto.
        return
      }
      setStageNumber(initial.stage_number)
      setTitle(initial.title)
      setIsReleased(initial.is_released)
      setActive(initial.active)
      return
    }

    setStageNumber(suggestedStageNumber ?? 1)
    setTitle('')
    setIsReleased(false)
    setActive(true)
  }, [isEdit, initial, suggestedStageNumber])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) {
      setFormError('Firebase não inicializado.')
      return
    }
    const dbOk = db

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setFormError('Informe o nome do stage.')
      return
    }

    if (!trailId.trim()) {
      setFormError('trail_id ausente.')
      return
    }

    if (isEdit) {
      if (!docId || !initial) {
        setFormError('Stage inicial ausente para edição.')
        return
      }

      setSaving(true)
      setFormError(null)
      try {
        await updateDoc(doc(dbOk, TRAIL_STAGES_COLLECTION, docId), {
          title: trimmedTitle,
          is_released: isReleased,
          active,
          updated_at: serverTimestamp(),
        })
        onSaved?.()
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
      } finally {
        setSaving(false)
      }
      return
    }

    // Criação: segue a regra do contrato (starts sempre false/true).
    const stageNumberInput = String(stageNumber)
    const stageNumberInt = parseStageNumberInt(stageNumberInput)
    if (!stageNumberInt) {
      setFormError('stage_number inválido (inteiro >= 1).')
      return
    }

    const newDocId = trailStageDocId(trailId, stageNumberInt)
    const now = serverTimestamp()

    setSaving(true)
    setFormError(null)
    try {
      await runTransaction(dbOk, async (tx) => {
        const ref = doc(dbOk, TRAIL_STAGES_COLLECTION, newDocId)
        const existing = await tx.get(ref)
        if (existing.exists()) {
          throw new Error(
            `Já existe um stage_number ${stageNumberInt} para trail_id "${trailId}".`,
          )
        }

        tx.set(ref, {
          trail_id: trailId,
          stage_number: stageNumberInt,
          title: trimmedTitle,
          is_released: false,
          active: true,
          created_at: now,
          updated_at: now,
        })
      })

      onSaved?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!db || !docId) return
    if (!initial) return
    const ok = window.confirm(
      `Excluir stage "${initial.title || docId}"? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return

    setSaving(true)
    setFormError(null)
    try {
      await deleteDoc(doc(db, TRAIL_STAGES_COLLECTION, docId))
      onSaved?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <h2>{isEdit ? 'Editar stage' : 'Novo stage'}</h2>
      <p className="admin__lede muted">
        {isEdit ? stageNumberLabel : 'Campos liberados: title e stage_number.'}
      </p>

      {formError ? (
        <p className="banner banner--error" role="alert">
          {formError}
        </p>
      ) : null}

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>stage_number</span>
          <input
            type="number"
            value={stageNumber}
            onChange={(e) => setStageNumber(Number.parseInt(e.target.value, 10))}
            disabled={isEdit}
            min={1}
            step={1}
          />
        </label>

        <label className="field">
          <span>title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Frações básicas"
          />
        </label>

        {isEdit ? (
          <>
            <label className="field field--inline">
              <input
                type="checkbox"
                checked={isReleased}
                onChange={(e) => setIsReleased(e.target.checked)}
              />
              <span>stage liberado para alunos</span>
            </label>

            <label className="field field--inline">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>stage ativo no sistema</span>
            </label>
          </>
        ) : (
          <>
            <label className="field field--inline">
              <input type="checkbox" checked={isReleased} disabled />
              <span>is_released inicia como false</span>
            </label>
            <label className="field field--inline">
              <input type="checkbox" checked={active} disabled />
              <span>active inicia como true</span>
            </label>
          </>
        )}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving || !db}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          {onCancel ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onCancel()}
              disabled={saving}
            >
              Cancelar
            </button>
          ) : null}

          {isEdit ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void handleDelete()}
              disabled={saving}
            >
              Excluir stage
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}

