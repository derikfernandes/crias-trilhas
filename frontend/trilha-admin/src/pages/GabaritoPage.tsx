import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  snapshotToTrail,
  TRAILS_COLLECTION,
} from '../lib/trailFirestore'
import {
  snapshotToTrailStage,
  TRAIL_STAGES_COLLECTION,
} from '../lib/trailStageFirestore'
import {
  snapshotToTrailStageQuestion,
  TRAIL_STAGE_QUESTIONS_COLLECTION,
} from '../lib/trailStageQuestionFirestore'
import type { Trail } from '../types/trail'
import type { TrailStage } from '../types/trailStage'
import type { TrailStageQuestion } from '../types/trailStageQuestion'

const LAST_TRAIL_ID_STORAGE_KEY = 'trilha_admin_gabarito_trail_id'

type SortBy = 'stage' | 'question'
type SortDir = 'asc' | 'desc'

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; count: number }
  | { kind: 'error'; message: string }

export function GabaritoPage() {
  const [trails, setTrails] = useState<Trail[]>([])
  const [loadingTrails, setLoadingTrails] = useState(true)
  const [trailsError, setTrailsError] = useState<string | null>(null)
  const [onlyActiveTrails, setOnlyActiveTrails] = useState(true)
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(() => {
    const saved = window.localStorage.getItem(LAST_TRAIL_ID_STORAGE_KEY)
    return saved?.trim() ? saved : null
  })

  const [stages, setStages] = useState<TrailStage[]>([])
  const [questions, setQuestions] = useState<TrailStageQuestion[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [onlyMissing, setOnlyMissing] = useState(false)
  const [filterStage, setFilterStage] = useState<number | ''>('')
  const [filterQuestion, setFilterQuestion] = useState<number | ''>('')
  const [sortBy, setSortBy] = useState<SortBy>('stage')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  /** Edições pendentes: docId -> valor digitado de correct_option. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  useEffect(() => {
    if (!db) {
      setLoadingTrails(false)
      return
    }
    const unsub = onSnapshot(
      collection(db, TRAILS_COLLECTION),
      (snap) => {
        const list = snap.docs.map(snapshotToTrail)
        list.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', 'pt-BR', {
            sensitivity: 'base',
          }),
        )
        setTrails(list)
        setTrailsError(null)
        setLoadingTrails(false)
      },
      (err) => {
        setTrailsError(err.message)
        setLoadingTrails(false)
      },
    )
    return () => unsub()
  }, [])

  const visibleTrails = useMemo(
    () => (onlyActiveTrails ? trails.filter((t) => t.active) : trails),
    [trails, onlyActiveTrails],
  )

  useEffect(() => {
    if (!selectedTrailId) return
    if (!loadingTrails && !visibleTrails.some((t) => t.id === selectedTrailId)) {
      setSelectedTrailId(null)
    }
  }, [selectedTrailId, visibleTrails, loadingTrails])

  useEffect(() => {
    if (!selectedTrailId?.trim()) return
    window.localStorage.setItem(LAST_TRAIL_ID_STORAGE_KEY, selectedTrailId)
  }, [selectedTrailId])

  useEffect(() => {
    let unsubStages: (() => void) | null = null
    let unsubQuestions: (() => void) | null = null

    setDrafts({})
    setSaveState({ kind: 'idle' })
    setFilterStage('')
    setFilterQuestion('')
    setSortBy('stage')
    setSortDir('asc')

    if (!db || !selectedTrailId) {
      setStages([])
      setQuestions([])
      setDataError(null)
      setLoadingData(false)
      return
    }

    setLoadingData(true)

    unsubStages = onSnapshot(
      query(
        collection(db, TRAIL_STAGES_COLLECTION),
        where('trail_id', '==', selectedTrailId),
      ),
      (snap) => {
        setStages(snap.docs.map(snapshotToTrailStage))
        setDataError(null)
      },
      (err) => {
        setDataError(err.message)
        setStages([])
      },
    )

    unsubQuestions = onSnapshot(
      query(
        collection(db, TRAIL_STAGE_QUESTIONS_COLLECTION),
        where('trail_id', '==', selectedTrailId),
      ),
      (snap) => {
        setQuestions(snap.docs.map(snapshotToTrailStageQuestion))
        setDataError(null)
        setLoadingData(false)
      },
      (err) => {
        setDataError(err.message)
        setQuestions([])
        setLoadingData(false)
      },
    )

    return () => {
      unsubStages?.()
      unsubQuestions?.()
    }
  }, [selectedTrailId])

  const stageTypeByNumber = useMemo(() => {
    const map = new Map<number, TrailStage>()
    for (const s of stages) map.set(s.stage_number, s)
    return map
  }, [stages])

  const exerciseQuestions = useMemo(() => {
    const list = questions.filter(
      (q) => stageTypeByNumber.get(q.stage_number)?.stage_type === 'exercise',
    )
    list.sort((a, b) =>
      a.stage_number !== b.stage_number
        ? a.stage_number - b.stage_number
        : a.question_number - b.question_number,
    )
    return list
  }, [questions, stageTypeByNumber])

  const missingCount = useMemo(
    () =>
      exerciseQuestions.filter((q) => !(q.correct_option ?? '').trim()).length,
    [exerciseQuestions],
  )

  const availableStages = useMemo(() => {
    const nums = new Set(exerciseQuestions.map((q) => q.stage_number))
    return [...nums].sort((a, b) => a - b)
  }, [exerciseQuestions])

  const availableQuestions = useMemo(() => {
    const source =
      filterStage !== ''
        ? exerciseQuestions.filter((q) => q.stage_number === filterStage)
        : exerciseQuestions
    const nums = new Set(source.map((q) => q.question_number))
    return [...nums].sort((a, b) => a - b)
  }, [exerciseQuestions, filterStage])

  useEffect(() => {
    if (
      filterQuestion !== '' &&
      !availableQuestions.includes(filterQuestion)
    ) {
      setFilterQuestion('')
    }
  }, [availableQuestions, filterQuestion])

  const visibleQuestions = useMemo(() => {
    let list = exerciseQuestions
    if (onlyMissing) {
      list = list.filter((q) => !(q.correct_option ?? '').trim())
    }
    if (filterStage !== '') {
      list = list.filter((q) => q.stage_number === filterStage)
    }
    if (filterQuestion !== '') {
      list = list.filter((q) => q.question_number === filterQuestion)
    }
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'stage') {
        cmp = a.stage_number - b.stage_number
        if (cmp === 0) cmp = a.question_number - b.question_number
      } else {
        cmp = a.question_number - b.question_number
        if (cmp === 0) cmp = a.stage_number - b.stage_number
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [
    exerciseQuestions,
    onlyMissing,
    filterStage,
    filterQuestion,
    sortBy,
    sortDir,
  ])

  /** Valor exibido no input: rascunho se existir, senão o salvo. */
  function inputValue(q: TrailStageQuestion): string {
    return drafts[q.id] ?? q.correct_option ?? ''
  }

  function isDirty(q: TrailStageQuestion): boolean {
    if (!(q.id in drafts)) return false
    return drafts[q.id].trim() !== (q.correct_option ?? '').trim()
  }

  const dirtyQuestions = useMemo(
    () => exerciseQuestions.filter((q) => isDirty(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exerciseQuestions, drafts],
  )

  function validateDraft(q: TrailStageQuestion, value: string): string | null {
    const v = value.trim()
    if (!v) return null
    if (q.options && q.options.length > 0) {
      const keys = q.options.map((o) => o.key)
      if (!keys.includes(v)) {
        return `Deve ser uma das alternativas: ${keys.join(', ')}`
      }
    }
    return null
  }

  const validationErrors = useMemo(() => {
    const errs = new Map<string, string>()
    for (const q of dirtyQuestions) {
      const err = validateDraft(q, drafts[q.id] ?? '')
      if (err) errs.set(q.id, err)
    }
    return errs
  }, [dirtyQuestions, drafts])

  async function handleSaveAll() {
    if (!db) return
    if (dirtyQuestions.length === 0) return
    if (validationErrors.size > 0) {
      setSaveState({
        kind: 'error',
        message: 'Corrija os campos destacados antes de salvar.',
      })
      return
    }

    setSaveState({ kind: 'saving' })
    try {
      const dbOk = db
      await Promise.all(
        dirtyQuestions.map((q) => {
          const v = (drafts[q.id] ?? '').trim()
          return updateDoc(doc(dbOk, TRAIL_STAGE_QUESTIONS_COLLECTION, q.id), {
            correct_option: v || null,
            updated_at: serverTimestamp(),
          })
        }),
      )
      const count = dirtyQuestions.length
      setDrafts({})
      setSaveState({ kind: 'saved', count })
    } catch (err) {
      setSaveState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erro ao salvar.',
      })
    }
  }

  const selectedTrail = useMemo(
    () => trails.find((t) => t.id === selectedTrailId) ?? null,
    [trails, selectedTrailId],
  )

  function toggleSort(column: SortBy) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  function sortAria(column: SortBy): 'ascending' | 'descending' | 'none' {
    if (sortBy !== column) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <>
      <header className="admin__header">
        <h1>Gabarito</h1>
        <p className="admin__lede muted">
          Preencha a resposta correta (<code>correct_option</code>) das questões
          de exercício em massa. Sem gabarito, as respostas dos alunos não geram
          acertos/erros.
        </p>
        <div className="gerenciamento-toolbar">
          <Link className="btn btn--ghost" to="/">
            ← Início
          </Link>
          <label className="gerenciamento-select">
            <span className="muted">Trilha</span>
            <select
              value={selectedTrailId ?? ''}
              onChange={(e) => {
                const next = e.target.value.trim()
                setSelectedTrailId(next || null)
              }}
              disabled={loadingTrails || visibleTrails.length === 0}
            >
              <option value="">
                {loadingTrails ? 'Carregando trilhas…' : 'Selecione uma trilha'}
              </option>
              {visibleTrails.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id}
                  {t.active ? '' : ' (inativa)'}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline gabarito-toolbar-check">
            <input
              type="checkbox"
              checked={onlyActiveTrails}
              onChange={(e) => setOnlyActiveTrails(e.target.checked)}
            />
            <span>só trilhas ativas</span>
          </label>
        </div>
      </header>

      {trailsError ? (
        <p className="banner banner--error" role="alert">
          {trailsError}
        </p>
      ) : null}

      {!selectedTrailId ? (
        <section className="panel">
          <p className="muted gerenciamento-placeholder">
            Selecione uma trilha para listar as questões de exercício e
            preencher o gabarito.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="panel__head">
            <h2>
              {selectedTrail?.name?.trim() || 'Trilha'}{' '}
              <span className="muted gerenciamento-id">({selectedTrailId})</span>
            </h2>
            <p className="admin__actions gerenciamento-detail-actions">
              {loadingData ? <span className="muted">Carregando…</span> : null}
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => void handleSaveAll()}
                disabled={
                  saveState.kind === 'saving' || dirtyQuestions.length === 0
                }
              >
                {saveState.kind === 'saving'
                  ? 'Salvando…'
                  : dirtyQuestions.length > 0
                    ? `Salvar alterações (${dirtyQuestions.length})`
                    : 'Salvar alterações'}
              </button>
            </p>
          </div>

          {dataError ? (
            <p className="banner banner--error" role="alert">
              {dataError}
            </p>
          ) : null}
          {saveState.kind === 'error' ? (
            <p className="banner banner--error" role="alert">
              {saveState.message}
            </p>
          ) : null}
          {saveState.kind === 'saved' ? (
            <p className="banner banner--success" role="status">
              {saveState.count === 1
                ? 'Gabarito de 1 questão salvo.'
                : `Gabarito de ${saveState.count} questões salvo.`}
            </p>
          ) : null}

          <div className="gabarito-filters">
            <label className="field field--inline gabarito-filters__check">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
              />
              <span>só sem gabarito</span>
            </label>
            <label className="gabarito-filter-select">
              <span className="muted">Stage</span>
              <select
                value={filterStage === '' ? '' : String(filterStage)}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  setFilterStage(v ? Number(v) : '')
                }}
                disabled={loadingData || availableStages.length === 0}
              >
                <option value="">Todos</option>
                {availableStages.map((n) => (
                  <option key={n} value={n}>
                    Stage {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="gabarito-filter-select">
              <span className="muted">Questão</span>
              <select
                value={filterQuestion === '' ? '' : String(filterQuestion)}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  setFilterQuestion(v ? Number(v) : '')
                }}
                disabled={loadingData || availableQuestions.length === 0}
              >
                <option value="">Todas</option>
                {availableQuestions.map((n) => (
                  <option key={n} value={n}>
                    Questão {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="gabarito-filters__summary muted">
              {exerciseQuestions.length === 0
                ? 'Nenhuma questão de exercício nesta trilha.'
                : missingCount === 0
                  ? `Todas as ${exerciseQuestions.length} questões têm gabarito.`
                  : `${missingCount} de ${exerciseQuestions.length} sem gabarito.`}
              {visibleQuestions.length !== exerciseQuestions.length &&
              exerciseQuestions.length > 0
                ? ` Exibindo ${visibleQuestions.length}.`
                : null}
            </p>
          </div>

          <div className="table-wrap gabarito-table-wrap">
            <table className="table gabarito-table">
              <thead>
                <tr>
                  <th
                    className="gabarito-col-num gabarito-sort-th"
                    aria-sort={sortAria('stage')}
                  >
                    <button
                      type="button"
                      className={
                        sortBy === 'stage'
                          ? 'gabarito-sort-btn gabarito-sort-btn--active'
                          : 'gabarito-sort-btn'
                      }
                      onClick={() => toggleSort('stage')}
                      disabled={loadingData}
                    >
                      Stage
                      <span className="gabarito-sort-indicator" aria-hidden>
                        {sortBy === 'stage'
                          ? sortDir === 'asc'
                            ? '↑'
                            : '↓'
                          : '↕'}
                      </span>
                    </button>
                  </th>
                  <th
                    className="gabarito-col-num gabarito-sort-th"
                    aria-sort={sortAria('question')}
                  >
                    <button
                      type="button"
                      className={
                        sortBy === 'question'
                          ? 'gabarito-sort-btn gabarito-sort-btn--active'
                          : 'gabarito-sort-btn'
                      }
                      onClick={() => toggleSort('question')}
                      disabled={loadingData}
                    >
                      Questão
                      <span className="gabarito-sort-indicator" aria-hidden>
                        {sortBy === 'question'
                          ? sortDir === 'asc'
                            ? '↑'
                            : '↓'
                          : '↕'}
                      </span>
                    </button>
                  </th>
                  <th>Título</th>
                  <th>Conteúdo</th>
                  <th>Resposta correta</th>
                  <th className="gabarito-col-status">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  <tr>
                    <td colSpan={6} className="muted table__empty">
                      Carregando questões…
                    </td>
                  </tr>
                ) : visibleQuestions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted table__empty">
                      {exerciseQuestions.length === 0
                        ? 'Esta trilha não tem questões em stages do tipo exercise.'
                        : onlyMissing
                          ? 'Nenhuma questão sem gabarito com os filtros atuais.'
                          : 'Nenhuma questão corresponde aos filtros.'}
                    </td>
                  </tr>
                ) : (
                  visibleQuestions.map((q) => {
                    const saved = (q.correct_option ?? '').trim()
                    const value = inputValue(q)
                    const dirty = isDirty(q)
                    const err = dirty ? validateDraft(q, value) : null
                    const filled = dirty ? value.trim() !== '' : saved !== ''
                    return (
                      <tr key={q.id}>
                        <td className="gabarito-col-num">{q.stage_number}</td>
                        <td className="gabarito-col-num">{q.question_number}</td>
                        <td className="gabarito-text-cell">
                          {q.title || '—'}
                        </td>
                        <td className="gabarito-text-cell gabarito-content-cell">
                          {q.content || '—'}
                        </td>
                        <td className="gabarito-answer-cell">
                          <input
                            type="text"
                            className={
                              err
                                ? 'gabarito-input gabarito-input--error'
                                : 'gabarito-input'
                            }
                            value={value}
                            onChange={(e) => {
                              setDrafts((d) => ({
                                ...d,
                                [q.id]: e.target.value,
                              }))
                              if (saveState.kind === 'saved') {
                                setSaveState({ kind: 'idle' })
                              }
                            }}
                            placeholder={
                              q.options && q.options.length > 0
                                ? `Ex.: ${q.options[0].key}`
                                : 'Resposta correta'
                            }
                            aria-label={`Resposta correta de stage ${q.stage_number} questão ${q.question_number}`}
                          />
                          {err ? (
                            <span className="gabarito-input-error">{err}</span>
                          ) : null}
                        </td>
                        <td className="gabarito-col-status">
                          {filled ? (
                            <span className="badge badge--ok">
                              {dirty ? 'editado' : 'preenchido'}
                            </span>
                          ) : (
                            <span className="badge badge--warn">faltando</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
