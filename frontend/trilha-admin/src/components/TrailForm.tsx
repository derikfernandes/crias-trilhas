import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { TRAILS_COLLECTION } from '../lib/trailFirestore'
import { TRAIL_STAGES_COLLECTION, trailStageDocId } from '../lib/trailStageFirestore'
import {
  TRAIL_STAGE_QUESTIONS_COLLECTION,
  trailStageQuestionDocId,
} from '../lib/trailStageQuestionFirestore'
import { trailPath } from '../lib/paths'
import type { Trail } from '../types/trail'
import type { TrailStageType } from '../types/trailStage'

type Props = {
  /** Se ausente, modo criação. */
  docId?: string
  /** Instituição fixa usada no modo criação. */
  fixedInstitutionId?: string
  /** Dados atuais (modo edição); o pai mantém o listener do Firestore. */
  initial?: Trail
  /** Callback opcional após salvar com sucesso. */
  onSaved?: () => void
}

const DEFAULT_STEPS = 8
const MENTOR_IMAGE_URL =
  'https://i.ibb.co/Q3Cb3SYm/Chat-GPT-Image-21-de-abr-de-2026-11-28-13-removebg-preview.png'

const PHASE_TYPE_LABELS: Record<TrailStageType, string> = {
  ai: 'IA (conteúdo gerado)',
  fixed: 'Texto fixo',
  exercise: 'Exercício',
}

const PHASE_TYPE_META: Record<TrailStageType, { icon: string; desc: string }> = {
  ai: { icon: '🧠', desc: 'A IA gera o conteúdo automaticamente' },
  fixed: { icon: '📄', desc: 'Você escreve o conteúdo manualmente' },
  exercise: { icon: '✏️', desc: 'Alunos respondem exercícios' },
}

/** Rótulos curtos no diagrama “fluxo de etapas”. */
const FLOW_TYPE_SHORT: Record<TrailStageType, string> = {
  ai: 'IA gera conteúdo',
  fixed: 'Texto fixo',
  exercise: 'Exercício',
}

const FLOW_DEMO_ETAPA_COUNT = 4

type StructurePhase = {
  id: string
  title: string
  stage_type: TrailStageType
  /** Texto do “comando da IA”; obrigatório quando `stage_type === 'ai'`. */
  prompt: string
}

type ContentPhase = {
  phaseId: string
  phaseTitle: string
  phaseType: TrailStageType
  aiPrompt: string
  fixedText: string
  exerciseQuestions: string[]
}

type ContentQuestion = {
  id: string
  title: string
  phases: ContentPhase[]
}

type ContentEtapa = {
  id: string
  name: string
  /** Quando true, todas as `trail_stage_questions` desta etapa ficam `is_released`. */
  released: boolean
  questions: ContentQuestion[]
}

function newStructurePhase(title: string, stage_type: TrailStageType): StructurePhase {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return { id, title, stage_type, prompt: '' }
}

function defaultStructurePhases(): StructurePhase[] {
  return [
    newStructurePhase('Introdução', 'ai'),
    newStructurePhase('Explicação', 'fixed'),
    newStructurePhase('Prática', 'exercise'),
  ]
}

function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function buildQuestionFromStructure(
  title: string,
  phases: StructurePhase[],
): ContentQuestion {
  return {
    id: newId('q'),
    title,
    phases: phases.map((phase) => ({
      phaseId: phase.id,
      phaseTitle: phase.title.trim() || 'Fase',
      phaseType: phase.stage_type,
      aiPrompt: phase.stage_type === 'ai' ? phase.prompt.trim() : '',
      fixedText: '',
      exerciseQuestions: [],
    })),
  }
}

function defaultEtapasFromStructure(_phases: StructurePhase[]): ContentEtapa[] {
  const firstQuestion = buildQuestionFromStructure('Questão 1', _phases)
  return [
    {
      id: newId('et'),
      name: 'Etapa 1',
      released: true,
      questions: [firstQuestion],
    },
  ]
}

function syncQuestionPhasesWithStructure(
  question: ContentQuestion,
  structure: StructurePhase[],
): ContentPhase[] {
  return structure.map((phaseDef, idx) => {
    const existing =
      question.phases[idx] ??
      question.phases.find((p) => p.phaseId === phaseDef.id) ??
      null

    return {
      phaseId: phaseDef.id,
      phaseTitle: phaseDef.title.trim() || `Fase ${idx + 1}`,
      phaseType: phaseDef.stage_type,
      aiPrompt:
        existing?.aiPrompt ??
        (phaseDef.stage_type === 'ai' ? phaseDef.prompt.trim() : ''),
      fixedText: existing?.fixedText ?? '',
      exerciseQuestions: existing?.exerciseQuestions ?? [],
    }
  })
}

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

export function TrailForm({ docId, fixedInstitutionId, initial, onSaved }: Props) {
  const navigate = useNavigate()
  const isEdit = Boolean(docId)
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1)
  const [createdTrailId, setCreatedTrailId] = useState<string | null>(null)
  const [contentEtapas, setContentEtapas] = useState<ContentEtapa[]>([])
  const [selectedEtapaId, setSelectedEtapaId] = useState<string | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [phaseSaved, setPhaseSaved] = useState<Record<string, boolean>>({})
  const [savingContentDraft, setSavingContentDraft] = useState(false)

  const [institution_id, setInstitutionId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [default_total_steps_per_stage, setDefaultTotalStepsPerStage] =
    useState(String(DEFAULT_STEPS))
  const [structurePhases, setStructurePhases] = useState<StructurePhase[]>(
    defaultStructurePhases,
  )
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const parsedSteps = useMemo(
    () => sanitizeStepsInt(default_total_steps_per_stage),
    [default_total_steps_per_stage],
  )
  const previewDescription = useMemo(() => {
    const trimmed = description.trim()
    if (!trimmed) return ''
    return trimmed.length > 140 ? `${trimmed.slice(0, 140)}...` : trimmed
  }, [description])

  const structurePhaseRows = useMemo(() => {
    const rows: StructurePhase[][] = []
    for (let i = 0; i < structurePhases.length; i += 3) {
      rows.push(structurePhases.slice(i, i + 3))
    }
    return rows
  }, [structurePhases])

  const selectedEtapa = useMemo(
    () => contentEtapas.find((et) => et.id === selectedEtapaId) ?? null,
    [contentEtapas, selectedEtapaId],
  )

  const selectedQuestion = useMemo(
    () =>
      selectedEtapa?.questions.find((q) => q.id === selectedQuestionId) ?? null,
    [selectedEtapa, selectedQuestionId],
  )

  useEffect(() => {
    if (!isEdit) {
      setInstitutionId((fixedInstitutionId ?? '').trim())
      setName('')
      setDescription('')
      setSubject('')
      setStructurePhases(defaultStructurePhases())
      setDefaultTotalStepsPerStage(String(DEFAULT_STEPS))
      setActive(true)
      setCreateStep(1)
      setCreatedTrailId(null)
      setContentEtapas([])
      setSelectedEtapaId(null)
      setSelectedQuestionId(null)
      setPhaseSaved({})
      setSavingContentDraft(false)
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
  }, [fixedInstitutionId, isEdit, initial])

  useEffect(() => {
    if (isEdit || createStep !== 3) return
    if (contentEtapas.length > 0) return
    const defaults = defaultEtapasFromStructure(structurePhases)
    setContentEtapas(defaults)
    setSelectedEtapaId(defaults[0]?.id ?? null)
    setSelectedQuestionId(defaults[0]?.questions[0]?.id ?? null)
  }, [createStep, contentEtapas.length, isEdit, structurePhases])

  useEffect(() => {
    if (!selectedEtapa) return
    if (!selectedQuestionId) {
      setSelectedQuestionId(selectedEtapa.questions[0]?.id ?? null)
      return
    }
    if (!selectedEtapa.questions.some((q) => q.id === selectedQuestionId)) {
      setSelectedQuestionId(selectedEtapa.questions[0]?.id ?? null)
    }
  }, [selectedEtapa, selectedQuestionId])

  useEffect(() => {
    if (isEdit || createStep !== 3) return
    if (contentEtapas.length === 0) return
    setContentEtapas((prev) =>
      prev.map((et) => ({
        ...et,
        questions: et.questions.map((q) => ({
          ...q,
          phases: syncQuestionPhasesWithStructure(q, structurePhases),
        })),
      })),
    )
  }, [createStep, isEdit, structurePhases, contentEtapas.length])

  useEffect(() => {
    if (!selectedEtapaId) return
    const etapa = contentEtapas.find((et) => et.id === selectedEtapaId)
    if (!etapa || etapa.questions.length > 0) return

    const autoQuestion = buildQuestionFromStructure('Questão 1', structurePhases)
    setContentEtapas((prev) =>
      prev.map((et) =>
        et.id === selectedEtapaId ? { ...et, questions: [autoQuestion] } : et,
      ),
    )
    setSelectedQuestionId(autoQuestion.id)
  }, [contentEtapas, selectedEtapaId, structurePhases])

  function handleNextCreateStep() {
    const trimmedName = trimRequiredString(name)
    const trimmedDescription = trimRequiredString(description)
    const trimmedSubject = trimRequiredString(subject)

    if (!trimmedName) {
      setFormError('Informe o nome da trilha.')
      return
    }
    if (!trimmedSubject) {
      setFormError('Informe a matéria/tema principal da trilha.')
      return
    }
    if (!trimmedDescription) {
      setFormError('Informe a descrição geral da trilha.')
      return
    }

    setFormError(null)
    setCreateStep(2)
  }

  function addStructurePhase() {
    setStructurePhases((prev) => [
      ...prev,
      newStructurePhase(`Fase ${prev.length + 1}`, 'fixed'),
    ])
  }

  function addEtapa() {
    setContentEtapas((prev) => {
      const autoQuestion = buildQuestionFromStructure('Questão 1', structurePhases)
      const created = {
        id: newId('et'),
        name: `Etapa ${prev.length + 1}`,
        released: false,
        questions: [autoQuestion],
      }
      setSelectedEtapaId(created.id)
      setSelectedQuestionId(autoQuestion.id)
      return [...prev, created]
    })
  }

  function updateQuestionTitle(questionId: string, value: string) {
    setContentEtapas((prev) =>
      prev.map((et) => ({
        ...et,
        questions: et.questions.map((q) =>
          q.id === questionId ? { ...q, title: value } : q,
        ),
      })),
    )
  }

  function updateQuestionPhase(
    questionId: string,
    phaseId: string,
    patch: Partial<Pick<ContentPhase, 'aiPrompt' | 'fixedText' | 'exerciseQuestions'>>,
  ) {
    setContentEtapas((prev) =>
      prev.map((et) => ({
        ...et,
        questions: et.questions.map((q) =>
          q.id === questionId
            ? {
                ...q,
                phases: q.phases.map((p) =>
                  p.phaseId === phaseId ? { ...p, ...patch } : p,
                ),
              }
            : q,
        ),
      })),
    )
    setPhaseSaved((prev) => ({
      ...prev,
      [`${questionId}:${phaseId}`]: false,
    }))
  }

  function markPhaseSaved(questionId: string, phaseId: string) {
    setPhaseSaved((prev) => ({
      ...prev,
      [`${questionId}:${phaseId}`]: true,
    }))
  }

  function toggleEtapaReleased(etapaId: string) {
    setContentEtapas((prev) =>
      prev.map((et) =>
        et.id === etapaId ? { ...et, released: !et.released } : et,
      ),
    )
  }

  async function handleSaveAndContinue() {
    if (!createdTrailId) return
    if (!db) return
    const dbOk = db
    if (contentEtapas.length === 0) {
      setFormError('Crie pelo menos uma etapa antes de continuar.')
      return
    }

    if (contentEtapas.some((etapa) => etapa.questions.length !== 1)) {
      setFormError(
        'Cada etapa deve ter exatamente 1 questão. Crie novos conteúdos adicionando uma nova etapa.',
      )
      return
    }

    const incomplete = contentEtapas.find((etapa) => {
      const question = etapa.questions[0]
      if (!question) return true
      return question.phases.some((phase) => {
        if (phase.phaseType === 'ai') return !trimRequiredString(phase.fixedText)
        if (phase.phaseType === 'fixed') return !trimRequiredString(phase.fixedText)
        const validExerciseItems = phase.exerciseQuestions.filter((item) =>
          Boolean(trimRequiredString(item)),
        )
        return validExerciseItems.length === 0
      })
    })

    if (incomplete) {
      setFormError(
        `Preencha as questões da etapa "${incomplete.name.trim() || 'Sem nome'}" em todas as fases antes de continuar.`,
      )
      return
    }

    setSavingContentDraft(true)
    setFormError(null)
    try {
      await runTransaction(dbOk, async (tx) => {
        contentEtapas.forEach((etapa, etapaIdx) => {
            const question = etapa.questions[0]
            if (!question) return
            const questionNumber = etapaIdx + 1
            question.phases.forEach((phase, phaseIdx) => {
              const stageNumber = phaseIdx + 1
              const ref = doc(
                dbOk,
                TRAIL_STAGE_QUESTIONS_COLLECTION,
                trailStageQuestionDocId(createdTrailId, stageNumber, questionNumber),
              )

              const etapaLabel = etapa.name.trim() || `Etapa ${etapaIdx + 1}`
              const questionLabel = question.title.trim() || `Questão ${questionNumber}`
              const exerciseLines = phase.exerciseQuestions
                .map((item) => item.trim())
                .filter(Boolean)

              const contentValue =
                phase.phaseType === 'ai'
                  ? phase.fixedText.trim()
                  : phase.phaseType === 'fixed'
                    ? phase.fixedText.trim()
                    : exerciseLines
                        .map((item, idx) => `${idx + 1}. ${item}`)
                        .join('\n')

              tx.set(ref, {
                trail_id: createdTrailId,
                stage_number: stageNumber,
                question_number: questionNumber,
                title: `${etapaLabel} — ${questionLabel}`,
                content: contentValue,
                correct_option: null,
                options: null,
                explanation: null,
                is_released: etapa.released,
                active: true,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
              })
            })
          })
      })

      navigate(trailPath(createdTrailId))
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Erro ao salvar os conteúdos.',
      )
    } finally {
      setSavingContentDraft(false)
    }
  }

  function removeStructurePhase(id: string) {
    setStructurePhases((prev) =>
      prev.length <= 1 ? prev : prev.filter((p) => p.id !== id),
    )
  }

  function updateStructurePhase(
    id: string,
    patch: Partial<Pick<StructurePhase, 'title' | 'stage_type' | 'prompt'>>,
  ) {
    setStructurePhases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isEdit && createStep !== 2) return
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
    let stepsToSave: number
    if (!isEdit) {
      if (structurePhases.length < 1) {
        setFormError('Inclua pelo menos uma fase na estrutura.')
        return
      }
      for (let i = 0; i < structurePhases.length; i++) {
        const phase = structurePhases[i]
        if (!trimRequiredString(phase.title)) {
          setFormError('Cada fase precisa de um nome.')
          return
        }
        if (phase.stage_type === 'ai' && !trimRequiredString(phase.prompt)) {
          const label = phase.title.trim() || `Fase ${i + 1}`
          setFormError(
            `A fase "${label}" usa IA e precisa de um comando da IA (instrução para o modelo).`,
          )
          return
        }
      }
      stepsToSave = structurePhases.length
    } else {
      if (parsedSteps === null) {
        setFormError('default_total_steps_per_stage deve ser um inteiro.')
        return
      }
      if (parsedSteps < 0) {
        setFormError('default_total_steps_per_stage não pode ser negativo.')
        return
      }
      stepsToSave = parsedSteps
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
          default_total_steps_per_stage: stepsToSave,
          active,
          updated_at: serverTimestamp(),
        })
        onSaved?.()
      } else {
        const targetTrailId =
          createdTrailId && createdTrailId.trim() ? createdTrailId : null

        const persistedId = await runTransaction(dbOk, async (tx) => {
          let trailId = targetTrailId
          let shouldIncrementCounter = false
          let counterNext: number | null = null

          if (!trailId) {
            // IDs sequenciais: t1, t2, t3...
            // Usa transação com contador em counters/trails { next: number }.
            const counterRef = doc(dbOk, 'counters', 'trails')
            const counterSnap = await tx.get(counterRef)
            const data = counterSnap.exists() ? counterSnap.data() : {}
            const rawNext = (data as { next?: unknown }).next
            const next =
              typeof rawNext === 'number' && Number.isFinite(rawNext) && rawNext >= 1
                ? Math.floor(rawNext)
                : 1
            counterNext = next

            trailId = `t${next}`
            const trailRefCheck = doc(collection(dbOk, TRAILS_COLLECTION), trailId)
            const existing = await tx.get(trailRefCheck)
            if (existing.exists()) {
              throw new Error(
                `Conflito ao gerar id sequencial (${trailId}). Verifique counters/trails.next.`,
              )
            }
            shouldIncrementCounter = true
          }

          const trailRef = doc(collection(dbOk, TRAILS_COLLECTION), trailId)
          const previousTrailSnap = await tx.get(trailRef)
          const previousData = previousTrailSnap.exists()
            ? (previousTrailSnap.data() as { default_total_steps_per_stage?: unknown })
            : {}
          const previousStepsRaw = previousData.default_total_steps_per_stage
          const previousSteps =
            typeof previousStepsRaw === 'number' &&
            Number.isFinite(previousStepsRaw) &&
            previousStepsRaw >= 0
              ? Math.floor(previousStepsRaw)
              : 0

          const stageSnapshots = new Map<number, ReturnType<typeof previousTrailSnap['data']> | null>()
          for (let i = 0; i < structurePhases.length; i++) {
            const stageNumber = i + 1
            const stageRef = doc(
              dbOk,
              TRAIL_STAGES_COLLECTION,
              trailStageDocId(trailId, stageNumber),
            )
            const stageSnap = await tx.get(stageRef)
            stageSnapshots.set(stageNumber, stageSnap.exists() ? stageSnap.data() : null)
          }

          tx.set(
            trailRef,
            {
              institution_id: instId,
              name: trimmedName,
              description: trimmedDescription,
              subject: trimmedSubject,
              default_total_steps_per_stage: stepsToSave,
              active,
              phase_blueprint: structurePhases.map((p) => ({
                title: p.title.trim(),
                stage_type: p.stage_type,
                prompt: p.stage_type === 'ai' ? p.prompt.trim() : null,
              })),
              created_at: previousTrailSnap.exists() ? previousTrailSnap.data()?.created_at ?? serverTimestamp() : serverTimestamp(),
              updated_at: serverTimestamp(),
            },
            { merge: true },
          )

          for (let i = 0; i < structurePhases.length; i++) {
            const phase = structurePhases[i]
            const stageNumber = i + 1
            const stageRef = doc(
              dbOk,
              TRAIL_STAGES_COLLECTION,
              trailStageDocId(trailId, stageNumber),
            )
            const stageData = stageSnapshots.get(stageNumber) ?? null
            tx.set(
              stageRef,
              {
                trail_id: trailId,
                stage_number: stageNumber,
                title: phase.title.trim(),
                stage_type: phase.stage_type,
                prompt: phase.stage_type === 'ai' ? phase.prompt.trim() : null,
                is_released: stageData?.is_released ?? false,
                active: stageData?.active ?? true,
                created_at: stageData?.created_at ?? serverTimestamp(),
                updated_at: serverTimestamp(),
              },
              { merge: true },
            )
          }

          for (let stageNumber = stepsToSave + 1; stageNumber <= previousSteps; stageNumber++) {
            const stageRef = doc(
              dbOk,
              TRAIL_STAGES_COLLECTION,
              trailStageDocId(trailId, stageNumber),
            )
            tx.delete(stageRef)
          }

          if (shouldIncrementCounter) {
            const counterRef = doc(dbOk, 'counters', 'trails')
            tx.set(counterRef, { next: (counterNext ?? 1) + 1 }, { merge: true })
          }

          return trailId
        })

        setCreatedTrailId(persistedId)
        setCreateStep(3)
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

  const createProgressPct = !isEdit ? `${(createStep / 3) * 100}%` : '0%'

  return (
    <section className="panel">
      {isEdit ? <h2>Editar cadastro</h2> : null}

      {!isEdit ? (
        <div className="trail-create-stepper-wrap">
          <div className="trail-create-stepper-progress" aria-hidden="true">
            <span
              className="trail-create-stepper-progress__fill"
              style={{ width: createProgressPct }}
            />
          </div>
          <div className="trail-create-stepper" aria-label="Progresso da criação da trilha">
            <div
              className={`trail-create-stepper__step ${createStep === 1 ? 'is-active' : createStep > 1 ? 'is-done' : ''}`}
            >
              <span className="trail-create-stepper__index">1</span>
              <span className="trail-create-stepper__label">Base da trilha</span>
            </div>
            <div className="trail-create-stepper__line" aria-hidden="true" />
            <div
              className={`trail-create-stepper__step ${createStep === 2 ? 'is-active' : createStep > 2 ? 'is-done' : ''}`}
            >
              <span className="trail-create-stepper__index">2</span>
              <span className="trail-create-stepper__label">Estrutura</span>
            </div>
            <div className="trail-create-stepper__line" aria-hidden="true" />
            <div className={`trail-create-stepper__step ${createStep === 3 ? 'is-active' : ''}`}>
              <span className="trail-create-stepper__index">3</span>
              <span className="trail-create-stepper__label">Conteúdos</span>
            </div>
          </div>
        </div>
      ) : null}

      {!isEdit && createStep === 3 && createdTrailId ? (
        <div className="trail-content-editor">
          <header className="trail-content-editor__header">
            <div>
              <h3>Conteúdos da trilha ✨</h3>
              <p className="muted">
                Crie as questões da etapa e o sistema aplicará cada uma delas em todas as fases da
                trilha, seguindo a ordem definida na estrutura.
              </p>
            </div>
            <aside className="trail-content-editor__tip">
              <strong>🧩 Como funciona?</strong>
              <p className="muted">
                Cada questão percorre todas as fases da etapa. O CRIAS aplica o conteúdo em todas
                elas, mantendo o fluxo consistente.
              </p>
            </aside>
          </header>

          {formError ? (
            <p className="banner banner--error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="trail-content-editor__grid">
            <section className="trail-content-editor__col">
              <div className="trail-content-editor__col-head">
                <h4>Etapas da trilha</h4>
                <button type="button" className="btn btn--ghost btn--small" onClick={addEtapa}>
                  + Nova etapa
                </button>
              </div>
              <div className="trail-content-editor__list">
                {contentEtapas.map((etapa, idx) => (
                  <div key={etapa.id} className="trail-content-editor__item-row">
                    <button
                      type="button"
                      className={`trail-content-editor__item ${selectedEtapaId === etapa.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedEtapaId(etapa.id)}
                    >
                      <div className="trail-content-editor__item-title">
                        Etapa {idx + 1} — {etapa.name.trim() || `Etapa ${idx + 1}`}
                      </div>
                      <div className="muted">
                        {etapa.questions.length} questão{etapa.questions.length === 1 ? '' : 'ões'}
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`trail-content-editor__etapa-release btn btn--small ${etapa.released ? 'is-released' : ''}`}
                      aria-pressed={etapa.released}
                      aria-label={
                        etapa.released
                          ? 'Etapa liberada para o aluno em todas as fases. Ativar para bloquear.'
                          : 'Etapa bloqueada. Ativar para liberar todas as fases para o aluno.'
                      }
                      title={
                        etapa.released
                          ? 'Etapa liberada: todas as fases visíveis para o aluno. Clique para bloquear.'
                          : 'Etapa bloqueada. Clique para liberar todas as fases para o aluno.'
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleEtapaReleased(etapa.id)
                      }}
                    >
                      <span className="trail-content-editor__etapa-release-icon" aria-hidden>
                        {etapa.released ? '🔓' : '🔒'}
                      </span>
                      <span className="trail-content-editor__etapa-release-label">
                        {etapa.released ? 'Liberada' : 'Bloqueada'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="trail-content-editor__support muted">
                💡 A estrutura (fases) é a mesma em todas as etapas. O conteúdo muda em cada
                questão.
              </p>
            </section>

            <section className="trail-content-editor__col trail-content-editor__col--editor">
              {selectedEtapa ? (
                <>
                  <div className="trail-content-editor__col-head trail-content-editor__col-head--etapa">
                    <h4>
                      Conteúdo da etapa "{selectedEtapa.name.trim() || 'Sem nome'}"
                    </h4>
                    <button
                      type="button"
                      className={`trail-content-editor__etapa-release trail-content-editor__etapa-release--inline btn btn--small btn--ghost ${selectedEtapa.released ? 'is-released' : ''}`}
                      aria-pressed={selectedEtapa.released}
                      aria-label={
                        selectedEtapa.released
                          ? 'Etapa liberada em todas as fases. Ativar para bloquear.'
                          : 'Liberar etapa para o aluno em todas as fases.'
                      }
                      title={
                        selectedEtapa.released
                          ? 'Etapa liberada (todas as fases). Clique para bloquear.'
                          : 'Clique para liberar esta etapa (todas as fases) para o aluno.'
                      }
                      onClick={() => toggleEtapaReleased(selectedEtapa.id)}
                    >
                      <span className="trail-content-editor__etapa-release-icon" aria-hidden>
                        {selectedEtapa.released ? '🔓' : '🔒'}
                      </span>
                      {selectedEtapa.released ? 'Liberada' : 'Liberar etapa'}
                    </button>
                  </div>
                  <p className="muted">Cada questão percorre todas as fases da trilha.</p>
                  <div className="trail-content-editor__list">
                    {selectedEtapa.questions.length === 0 ? (
                      <p className="muted">Nenhuma questão criada nesta etapa.</p>
                    ) : (
                      selectedEtapa.questions.map((question, qIdx) => (
                        <div
                          key={question.id}
                          className={`trail-content-editor__question ${selectedQuestionId === question.id ? 'is-active' : ''}`}
                        >
                          <div
                            className="trail-content-editor__question-main"
                            onClick={() => setSelectedQuestionId(question.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSelectedQuestionId(question.id)
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <span className="trail-content-editor__question-index">{qIdx + 1}</span>
                            <input
                              type="text"
                              value={question.title}
                              onChange={(e) => updateQuestionTitle(question.id, e.target.value)}
                              aria-label={`Título da questão ${qIdx + 1}`}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selectedQuestion ? (
                    <>
                  <h4>
                    Editando: <span>"{selectedQuestion.title || 'Nova questão'}"</span>
                  </h4>
                  <div className="trail-content-editor__phases-flow">
                    {selectedQuestion.phases.map((phase, idx) => (
                      <Fragment key={`${selectedQuestion.id}-${phase.phaseId}`}>
                        {idx > 0 ? (
                          <span className="trail-content-editor__phase-arrow" aria-hidden>
                            →
                          </span>
                        ) : null}
                        <div className="trail-content-editor__phase-chip">
                          <strong>Fase {idx + 1}</strong>
                          <span>{phase.phaseTitle}</span>
                          <small>
                            {phase.phaseType === 'ai'
                              ? 'IA'
                              : phase.phaseType === 'fixed'
                                ? 'Texto'
                                : 'Exercício'}
                          </small>
                        </div>
                      </Fragment>
                    ))}
                  </div>

                  <div className="trail-content-editor__phase-editors">
                    {selectedQuestion.phases.map((phase, idx) => (
                      <article
                        key={`editor-${selectedQuestion.id}-${phase.phaseId}`}
                        className="trail-content-editor__phase-editor"
                      >
                        <h5>
                          Fase {idx + 1} — {phase.phaseTitle}
                        </h5>

                        {phase.phaseType === 'ai' ? (
                          <>
                            <p className="trail-content-editor__phase-type">🧠 Conteúdo gerado por IA</p>
                            <label className="field">
                              <span>Conteúdo da fase</span>
                              <textarea
                                rows={6}
                                value={phase.fixedText}
                                onChange={(e) =>
                                  updateQuestionPhase(selectedQuestion.id, phase.phaseId, {
                                    fixedText: e.target.value,
                                  })
                                }
                                placeholder="Texto-base desta fase para a IA trabalhar."
                              />
                            </label>
                            <p className="muted">A IA usa o conteúdo desta fase como base.</p>
                          </>
                        ) : null}

                        {phase.phaseType === 'fixed' ? (
                          <>
                            <p className="trail-content-editor__phase-type">📄 Texto fixo</p>
                            <label className="field">
                              <span>Conteúdo</span>
                              <textarea
                                rows={6}
                                value={phase.fixedText}
                                onChange={(e) =>
                                  updateQuestionPhase(selectedQuestion.id, phase.phaseId, {
                                    fixedText: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </>
                        ) : null}

                        {phase.phaseType === 'exercise' ? (
                          <>
                            <p className="trail-content-editor__phase-type">✏️ Exercício</p>
                            <label className="field">
                              <span>Pergunta do exercício</span>
                              <textarea
                                rows={4}
                                value={phase.exerciseQuestions[0] ?? ''}
                                onChange={(e) =>
                                  updateQuestionPhase(selectedQuestion.id, phase.phaseId, {
                                    exerciseQuestions: [e.target.value],
                                  })
                                }
                                placeholder="Escreva a pergunta desta fase de exercício."
                              />
                            </label>
                          </>
                        ) : null}
                        <div className="trail-content-editor__phase-save">
                          <button
                            type="button"
                            className="btn btn--small btn--primary"
                            onClick={() => markPhaseSaved(selectedQuestion.id, phase.phaseId)}
                          >
                            Salvar
                          </button>
                          {phaseSaved[`${selectedQuestion.id}:${phase.phaseId}`] ? (
                            <span className="trail-content-editor__saved">
                              ✅ Salvo
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                    </>
                  ) : (
                    <p className="muted">Selecione ou crie uma questão para editar os conteúdos por fase.</p>
                  )}
                </>
              ) : (
                <p className="muted">Selecione uma etapa para criar e editar as questões.</p>
              )}
            </section>
          </div>

          <footer className="trail-content-editor__footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setCreateStep(2)}
              disabled={savingContentDraft}
            >
              ← Voltar
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveAndContinue}
              disabled={savingContentDraft}
            >
              {savingContentDraft ? 'Salvando…' : 'Salvar e continuar →'}
            </button>
          </footer>
        </div>
      ) : (
        <form className="form trail-create-form" onSubmit={handleSubmit}>
        {isEdit || createStep === 1 ? (
          <>
            {!isEdit ? (
              <div className="trail-create-card__intro">
                <p className="trail-create-card__eyebrow">Etapa 1 de 3 • Informações básicas</p>
                <h3>Crie sua trilha de aprendizado</h3>
                <p className="muted">
                  Defina o ponto de partida da sua trilha. Depois você monta a estrutura de fases e,
                  na etapa final, os conteúdos (questões) de cada fase.
                </p>
              </div>
            ) : null}

            <div className={isEdit ? 'trail-create-card' : 'trail-create-grid'}>
              <div className="trail-create-card trail-create-card--form">
                {!isEdit ? (
                  <p className="trail-create-card__eyebrow">Etapa 1 de 3 • Informações básicas</p>
                ) : null}
                <label className="field">
                  <span>Nome da trilha</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Matemática Básica para o 6º ano"
                    autoComplete="organization"
                  />
                </label>

                <label className="field">
                  <span>Matéria ou tema principal</span>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Matemática"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>O que o aluno vai aprender nessa trilha?</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Ex: Revisão dos conceitos básicos de matemática, com foco em operações e resolução de problemas."
                  />
                </label>
              </div>

              {!isEdit ? (
                <aside className="trail-create-side">
                  <div className="trail-create-card__preview" aria-live="polite">
                    <p className="trail-create-card__preview-title">🖼️ Sua trilha</p>
                    {name.trim() ? (
                      <>
                        <p className="trail-create-card__preview-name">
                          <strong>📖 {name.trim()}</strong>
                        </p>
                        <p className="muted">📖 {subject.trim() || 'Matéria'}</p>
                        <p className="trail-create-card__preview-description muted">
                          ✨ <strong>O aluno vai aprender:</strong>
                          <br />
                          {previewDescription || 'Adicione uma descrição para completar a visão da trilha.'}
                        </p>
                      </>
                    ) : (
                      <p className="trail-create-card__preview-empty">Dê um nome para começar ✨</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary trail-create-cta"
                    onClick={handleNextCreateStep}
                  >
                    Continuar → Estruturar etapas
                  </button>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}

        {isEdit || createStep === 2 ? (
          <>
            {!isEdit ? (
              <div className="trail-structure">
                <header className="trail-structure__hero">
                  <div>
                    <h3>Como funciona o CRIAS ✨</h3>
                    <p className="muted">
                      Você define a estrutura da sua trilha do seu jeito. Essa estrutura será
                      usada em todas as etapas, sendo repetida com novos conteúdos.
                    </p>
                  </div>
                  <div className="trail-structure__hero-aside">
                    <img src={MENTOR_IMAGE_URL} alt="Mentor CRIAS" />
                    <div className="trail-structure__hero-note">
                      Você tem total liberdade para criar a estrutura que fizer mais sentido
                      para o seu conteúdo!
                    </div>
                  </div>
                </header>

                <section className="trail-structure__panel">
                  <h4>
                    <span>1</span> Você monta a estrutura da trilha
                  </h4>
                  <p className="muted">
                    Defina quantas fases vão ter dentro de cada etapa da trilha e escolha o
                    tipo de cada uma.
                  </p>
                  <div className="trail-structure__controls">
                    <label className="field field--inline">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                      />
                      <span>Trilha ativa desde o início</span>
                    </label>
                  </div>
                  <div className="trail-structure__builder">
                    <div className="trail-structure__cards">
                      {structurePhaseRows.map((row, rowIndex) => (
                        <div
                          className="trail-structure__cards-row"
                          key={row.map((p) => p.id).join('-')}
                        >
                          {row.map((phase, colIndex) => {
                            const index = rowIndex * 3 + colIndex
                            return (
                              <Fragment key={phase.id}>
                                {colIndex > 0 ? (
                                  <span
                                    className="trail-structure__cards-chevron"
                                    aria-hidden
                                  >
                                    ›
                                  </span>
                                ) : null}
                                <article
                                  className={`trail-structure__phase-card trail-structure__phase-card--i${index % 3}`}
                                >
                                  <div className="trail-structure__phase-card-head">
                                    <div className="trail-structure__phase-head-main">
                                      <span
                                        className="trail-structure__phase-index"
                                        aria-hidden
                                      >
                                        {index + 1}
                                      </span>
                                      <input
                                        type="text"
                                        className="trail-structure__phase-title"
                                        value={phase.title}
                                        onChange={(e) =>
                                          updateStructurePhase(phase.id, {
                                            title: e.target.value,
                                          })
                                        }
                                        placeholder={`Fase ${index + 1}`}
                                        autoComplete="off"
                                        aria-label={`Nome da fase ${index + 1}`}
                                      />
                                    </div>
                                    {structurePhases.length > 1 ? (
                                      <button
                                        type="button"
                                        className="trail-structure__phase-remove"
                                        onClick={() =>
                                          removeStructurePhase(phase.id)
                                        }
                                        aria-label={`Remover fase ${index + 1}`}
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                  <div className="trail-structure__phase-type-box">
                                    <span
                                      className="trail-structure__phase-type-icon"
                                      aria-hidden
                                    >
                                      {PHASE_TYPE_META[phase.stage_type].icon}
                                    </span>
                                    <select
                                      className="trail-structure__phase-type-select"
                                      value={phase.stage_type}
                                      onChange={(e) => {
                                        const next = e.target.value as TrailStageType
                                        updateStructurePhase(phase.id, {
                                          stage_type: next,
                                          prompt: next === 'ai' ? phase.prompt : '',
                                        })
                                      }}
                                      aria-label={`Tipo da fase ${index + 1}`}
                                    >
                                      {(
                                        Object.keys(
                                          PHASE_TYPE_LABELS,
                                        ) as TrailStageType[]
                                      ).map((t) => (
                                        <option key={t} value={t}>
                                          {PHASE_TYPE_LABELS[t]}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <p className="trail-structure__phase-desc">
                                    {PHASE_TYPE_META[phase.stage_type].desc}
                                  </p>
                                  {phase.stage_type === 'ai' ? (
                                    <label className="trail-structure__phase-prompt">
                                      <span className="trail-structure__phase-prompt-label">
                                        Comando da IA
                                      </span>
                                      <textarea
                                        className="trail-structure__phase-prompt-input"
                                        value={phase.prompt}
                                        onChange={(e) =>
                                          updateStructurePhase(phase.id, {
                                            prompt: e.target.value,
                                          })
                                        }
                                        rows={3}
                                        placeholder="Descreva o que a IA deve gerar nesta fase…"
                                        aria-label={`Comando da IA da fase ${index + 1}`}
                                      />
                                    </label>
                                  ) : null}
                                </article>
                              </Fragment>
                            )
                          })}
                          {rowIndex === structurePhaseRows.length - 1 ? (
                            <>
                              <span
                                className="trail-structure__cards-chevron"
                                aria-hidden
                              >
                                ›
                              </span>
                              <button
                                type="button"
                                className="trail-structure__add-card"
                                onClick={addStructurePhase}
                              >
                                <strong aria-hidden>+</strong>
                                <span className="muted">Adicionar fase</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <aside className="trail-structure__decision-box">
                      <h5>Você decide:</h5>
                      <ul>
                        <li>Quantas fases terá cada etapa</li>
                        <li>Qual o nome de cada fase</li>
                        <li>Qual o tipo de cada fase</li>
                        <li>O comando da IA nas fases com IA</li>
                      </ul>
                    </aside>
                  </div>

                  <div
                    className="trail-structure__flow"
                    aria-label="Visualização: sua estrutura fixa repetida em cada etapa"
                  >
                    <p className="trail-structure__flow-intro muted">
                      Assim sua estrutura se aplica a cada etapa da trilha:
                    </p>
                    <div className="trail-structure__flow-main">
                      <div className="trail-structure__flow-base">
                        <div className="trail-structure__flow-base-head">
                          <span className="trail-structure__flow-lock" aria-hidden>
                            🔒
                          </span>
                          <strong>Sua estrutura (fixa)</strong>
                        </div>
                        <ul className="trail-structure__flow-base-list">
                          {structurePhases.map((phase, i) => (
                            <li
                              key={phase.id}
                              className={`trail-structure__flow-line trail-structure__flow-line--i${i % 3}`}
                            >
                              <span className="trail-structure__flow-badge">{i + 1}</span>
                              <span className="trail-structure__flow-phase-title">
                                {phase.title.trim() || `Fase ${i + 1}`}
                              </span>
                              <span className="trail-structure__flow-mini-type">
                                <span aria-hidden>{PHASE_TYPE_META[phase.stage_type].icon}</span>
                                <span>
                                  {phase.stage_type === 'ai'
                                    ? 'IA'
                                    : phase.stage_type === 'fixed'
                                      ? 'Texto'
                                      : 'Exercício'}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <span className="trail-structure__flow-arrow" aria-hidden>
                        →
                      </span>

                      <div className="trail-structure__flow-etapas">
                        <div className="trail-structure__flow-ribbon">
                          <span className="trail-structure__flow-ribbon-line" aria-hidden />
                          <span className="trail-structure__flow-ribbon-text">
                            Repetido quantas vezes você quiser
                          </span>
                          <span className="trail-structure__flow-ribbon-line" aria-hidden />
                        </div>
                        <div className="trail-structure__flow-etapas-row">
                          {Array.from({ length: FLOW_DEMO_ETAPA_COUNT }, (_, ei) => (
                            <Fragment key={`flow-etapa-${ei}`}>
                              {ei > 0 ? (
                                <span className="trail-structure__flow-arrow trail-structure__flow-arrow--sm" aria-hidden>
                                  →
                                </span>
                              ) : null}
                              <div className="trail-structure__flow-etapa-card">
                                <div className="trail-structure__flow-etapa-head">
                                  <strong>Etapa {ei + 1}</strong>
                                  <span className="muted">
                                    Conteúdo {ei + 1}*
                                  </span>
                                </div>
                                <ul className="trail-structure__flow-etapa-list">
                                  {structurePhases.map((phase, i) => (
                                    <li
                                      key={`${phase.id}-${ei}`}
                                      className={`trail-structure__flow-mini-line trail-structure__flow-line--i${i % 3}`}
                                    >
                                      <span className="trail-structure__flow-badge trail-structure__flow-badge--sm">
                                        {i + 1}
                                      </span>
                                      <span aria-hidden>
                                        {PHASE_TYPE_META[phase.stage_type].icon}
                                      </span>
                                      <span className="trail-structure__flow-short">
                                        {FLOW_TYPE_SHORT[phase.stage_type]}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </Fragment>
                          ))}
                          <span className="trail-structure__flow-arrow trail-structure__flow-arrow--sm" aria-hidden>
                            →
                          </span>
                          <div className="trail-structure__flow-more">
                            <span aria-hidden>…</span>
                            <span>E assim sucessivamente!</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="trail-structure__flow-footnote muted">
                      *Os conteúdos serão definidos no próximo passo
                    </p>
                  </div>
                </section>

                <footer className="trail-structure__footer">
                  <p className="muted">✨ Salvar trilha e seguir para a definição de conteúdos?</p>
                  <button type="submit" className="btn btn--primary trail-structure__cta" disabled={saving}>
                    {saving ? 'Salvando…' : 'Definir conteúdos →'}
                  </button>
                </footer>
              </div>
            ) : (
              <div className="trail-create-card">
                <div className="trail-create-card__intro">
                  <h3>Configurações iniciais</h3>
                </div>
                <label className="field">
                  <span>Quantidade de itens em cada etapa</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={default_total_steps_per_stage}
                    onChange={(e) => setDefaultTotalStepsPerStage(e.target.value)}
                  />
                </label>
                <label className="field field--inline">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span>Trilha ativa</span>
                </label>
              </div>
            )}
          </>
        ) : null}

        {formError ? (
          <p className="form__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form__actions">
          {isEdit ? (
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving
                ? 'Salvando…'
                : isEdit
                  ? 'Salvar alterações'
                  : 'Definir conteúdos →'}
            </button>
          ) : null}
          {!isEdit && createStep === 2 ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setCreateStep(1)}
              disabled={saving}
            >
              Card anterior
            </button>
          ) : null}
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
      )}
    </section>
  )
}

