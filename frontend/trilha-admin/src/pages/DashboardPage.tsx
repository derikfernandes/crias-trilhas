import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import { snapshotToStudent, STUDENTS_COLLECTION } from '../lib/studentFirestore'
import {
  snapshotToStudentTrail,
  STUDENT_TRAILS_COLLECTION,
} from '../lib/studentTrailFirestore'
import { snapshotToTrail, TRAILS_COLLECTION } from '../lib/trailFirestore'
import {
  snapshotToTrailStage,
  TRAIL_STAGES_COLLECTION,
} from '../lib/trailStageFirestore'
import {
  snapshotToTrailStageQuestion,
  TRAIL_STAGE_QUESTIONS_COLLECTION,
} from '../lib/trailStageQuestionFirestore'
import {
  CONVERSATION_LOGS_COLLECTION,
  snapshotToConversationLog,
} from '../lib/conversationLogFirestore'
import { studentPath, trailPath } from '../lib/paths'
import { usePermissions } from '../hooks/usePermissions'
import type { ConversationLog } from '../types/conversationLog'
import type { Institution } from '../types/institution'
import type { Student } from '../types/student'
import type { StudentTrail } from '../types/studentTrail'
import type { Trail } from '../types/trail'
import type { TrailStage } from '../types/trailStage'
import type { TrailStageQuestion } from '../types/trailStageQuestion'

const LAST_INSTITUTION_ID_STORAGE_KEY = 'trilha_admin_selected_institution_id'

const ALL_STUDENT_COLUMNS = [
  { key: 'phone', label: 'Telefone' },
  { key: 'released', label: 'Questões liberadas' },
  { key: 'done', label: 'Questões feitas' },
  { key: 'completionPct', label: '% conclusão' },
  { key: 'correct', label: 'Acertos' },
  { key: 'wrong', label: 'Erros' },
  { key: 'accuracyPct', label: '% de acerto' },
] as const

type StudentColumnKey = (typeof ALL_STUDENT_COLUMNS)[number]['key']

type StudentRow = {
  student: Student
  released: number
  done: number
  completionPct: number | null
  correct: number
  wrong: number
  accuracyPct: number | null
}

type PillRow = {
  key: string
  trailId: string
  trailName: string
  subject: string
  stageNumber: number
  questionNumber: number
  title: string
  total: number
  correct: number
  wrong: number
  accuracyPct: number
}

type PillSortKey =
  | 'trail'
  | 'position'
  | 'total'
  | 'correct'
  | 'wrong'
  | 'accuracyPct'

type StudentSortKey = 'name' | StudentColumnKey

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

function pct(num: number, den: number): number | null {
  if (den <= 0) return null
  return Math.round((num / den) * 100)
}

function formatPct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

function formatPctExport(v: number | null): string {
  return v === null ? '' : `${v}%`
}

function slugFileName(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'trilha'
  )
}

function stageQuestionColumn(stage: number, question: number): string {
  return `Q${question}.S${stage}`
}

const FIRESTORE_IN_LIMIT = 30

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function conversationLogTimestamp(log: ConversationLog): number {
  const ms = log.created_at?.toMillis?.() ?? 0
  if (ms > 0) return ms
  if (log.created_at_brasilia) {
    const normalized = log.created_at_brasilia.includes('T')
      ? log.created_at_brasilia
      : log.created_at_brasilia.replace(' ', 'T')
    const parsed = Date.parse(normalized)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

type AnswerCandidate = {
  text: string
  at: number
  isExercise: boolean
  logId: string
}

function normalizeAnswer(value: string): string {
  let s = value.trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }
  return s
}

function answersMatch(studentAnswer: string, correctOption: string): boolean {
  return (
    normalizeAnswer(studentAnswer).toLowerCase() ===
    normalizeAnswer(correctOption).toLowerCase()
  )
}

type LogAggregates = {
  doneByStudent: Map<string, Set<string>>
  answerMap: Map<string, string>
}

function buildLogAggregates(logs: ConversationLog[]): LogAggregates {
  const doneByStudent = new Map<string, Set<string>>()
  const byKey = new Map<string, AnswerCandidate[]>()

  for (const log of logs) {
    if (log.sender !== 'student') continue
    if (!log.student_id || !log.trail_id) continue
    if (log.stage_number < 1 || log.question_number < 1) continue

    const doneKey = `${log.trail_id}|${log.stage_number}|${log.question_number}`
    let doneSet = doneByStudent.get(log.student_id)
    if (!doneSet) {
      doneSet = new Set()
      doneByStudent.set(log.student_id, doneSet)
    }
    doneSet.add(doneKey)

    const answerKey = `${log.student_id}|${log.trail_id}|${log.stage_number}|${log.question_number}`
    const list = byKey.get(answerKey) ?? []
    list.push({
      text: log.message_text,
      at: conversationLogTimestamp(log),
      isExercise: log.message_type === 'exercise',
      logId: log.id,
    })
    byKey.set(answerKey, list)
  }

  const answerMap = new Map<string, string>()
  for (const [key, candidates] of byKey) {
    answerMap.set(key, pickBestStudentAnswer(candidates))
  }

  return { doneByStudent, answerMap }
}

function scoreStudentFromAnswerMap(
  studentId: string,
  enrolledTrailIds: Set<string>,
  answerMap: Map<string, string>,
  stageByKey: Map<string, TrailStage>,
  questionByKey: Map<string, TrailStageQuestion>,
  deselectedStages: Set<string>,
  deselectedQuestions: Set<number>,
): { correct: number; wrong: number } {
  let correct = 0
  let wrong = 0
  const prefix = `${studentId}|`

  for (const [key, answer] of answerMap) {
    if (!key.startsWith(prefix) || !answer.trim()) continue

    const rest = key.slice(prefix.length)
    const sep1 = rest.indexOf('|')
    const sep2 = rest.indexOf('|', sep1 + 1)
    if (sep1 < 0 || sep2 < 0) continue

    const trailId = rest.slice(0, sep1)
    const stage = Number(rest.slice(sep1 + 1, sep2))
    const question = Number(rest.slice(sep2 + 1))
    if (!enrolledTrailIds.has(trailId)) continue
    if (deselectedStages.has(`${trailId}|${stage}`)) continue
    if (deselectedQuestions.has(question)) continue

    const stageRec = stageByKey.get(`${trailId}|${stage}`)
    if (stageRec?.stage_type !== 'exercise') continue

    const gabarito = (
      questionByKey.get(`${trailId}|${stage}|${question}`)?.correct_option ?? ''
    ).trim()
    if (!gabarito) continue

    if (answersMatch(answer, gabarito)) correct += 1
    else wrong += 1
  }

  return { correct, wrong }
}

function pickBestStudentAnswer(candidates: AnswerCandidate[]): string {
  if (candidates.length === 0) return ''
  const exercises = candidates.filter((c) => c.isExercise)
  const pool = exercises.length > 0 ? exercises : candidates
  pool.sort((a, b) => {
    if (b.at !== a.at) return b.at - a.at
    return b.logId.localeCompare(a.logId)
  })
  return pool[0].text
}

const DATA_SOURCES = 3
const LOG_FETCH_BATCH_SIZE = 3

async function fetchConversationLogsForStudents(
  studentIds: string[],
  relevantTrailIds?: Set<string>,
  onProgress?: (completed: number, total: number) => void,
): Promise<ConversationLog[]> {
  if (!db || studentIds.length === 0) return []
  const dbOk = db

  const chunks = chunkArray(studentIds, FIRESTORE_IN_LIMIT)
  const chunkResults: ConversationLog[][] = []

  for (let i = 0; i < chunks.length; i += LOG_FETCH_BATCH_SIZE) {
    const batch = chunks.slice(i, i + LOG_FETCH_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        const snap = await getDocs(
          query(
            collection(dbOk, CONVERSATION_LOGS_COLLECTION),
            where('student_id', 'in', chunk),
          ),
        )
        return snap.docs.map(snapshotToConversationLog)
      }),
    )
    chunkResults.push(...batchResults)
    onProgress?.(Math.min(i + batch.length, chunks.length), chunks.length)
  }

  const byId = new Map<string, ConversationLog>()
  for (const logs of chunkResults) {
    for (const log of logs) {
      if (relevantTrailIds && !relevantTrailIds.has(log.trail_id)) continue
      byId.set(log.id, log)
    }
  }
  return [...byId.values()]
}

function forceWorksheetCellString(
  worksheet: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string,
) {
  const ref = XLSX.utils.encode_cell({ r: row, c: col })
  worksheet[ref] = { t: 's', v: value }
}

export function DashboardPage() {
  const { filterInstitutions } = usePermissions()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loadingInst, setLoadingInst] = useState(true)
  const [instError, setInstError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = window.localStorage.getItem(LAST_INSTITUTION_ID_STORAGE_KEY)
    return saved?.trim() ? saved : null
  })

  const [students, setStudents] = useState<Student[]>([])
  const [trails, setTrails] = useState<Trail[]>([])
  const [studentTrails, setStudentTrails] = useState<StudentTrail[]>([])
  const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>([])
  const [stages, setStages] = useState<TrailStage[]>([])
  const [questions, setQuestions] = useState<TrailStageQuestion[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [loadStepsDone, setLoadStepsDone] = useState(0)
  const [loadStepsTotal, setLoadStepsTotal] = useState(DATA_SOURCES + 1)
  const [loadPercent, setLoadPercent] = useState(0)
  const [loadLabel, setLoadLabel] = useState('')
  const [dataError, setDataError] = useState<string | null>(null)
  const loadProgressRef = useRef({ done: 0, total: DATA_SOURCES + 1 })

  const getLoadTargetPercent = () => {
    const { done, total } = loadProgressRef.current
    return Math.min(99, Math.round((done / Math.max(total, 1)) * 100))
  }

  const syncLoadProgress = (labelPrefix: string) => {
    const { done, total } = loadProgressRef.current
    setLoadStepsDone(done)
    setLoadStepsTotal(total)
    setLoadLabel(labelPrefix)
  }

  // Filtros da tabela de alunos
  const [nameFilter, setNameFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [pctMin, setPctMin] = useState(0)
  const [pctMax, setPctMax] = useState(100)
  const [hiddenColumns, setHiddenColumns] = useState<Set<StudentColumnKey>>(
    new Set(),
  )
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  /** Stages desmarcados (excluídos do cálculo). Vazio = todos incluídos. */
  const [deselectedStages, setDeselectedStages] = useState<Set<string>>(
    new Set(),
  )
  /** Questões desmarcadas (número da questão no stage). Vazio = todas incluídas. */
  const [deselectedQuestions, setDeselectedQuestions] = useState<Set<number>>(
    new Set(),
  )
  const [showStagePicker, setShowStagePicker] = useState(false)
  const [showQuestionPicker, setShowQuestionPicker] = useState(false)
  const [exportingTrailId, setExportingTrailId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [studentSort, setStudentSort] = useState<{
    key: StudentSortKey
    dir: 'asc' | 'desc'
  }>({ key: 'name', dir: 'asc' })

  // Filtros do ranking de pílulas
  const [pillSubjectFilter, setPillSubjectFilter] = useState('')
  const [pillMinResponses, setPillMinResponses] = useState(1)
  const [pillSort, setPillSort] = useState<{
    key: PillSortKey
    dir: 'asc' | 'desc'
  }>({ key: 'accuracyPct', dir: 'asc' })

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db) {
        setLoadingInst(false)
        return
      }
      unsub = onSnapshot(
        collection(db, INSTITUTIONS_COLLECTION),
        (snap) => {
          setInstitutions(snap.docs.map(snapshotToInstitution))
          setInstError(null)
          setLoadingInst(false)
        },
        (err) => {
          setInstError(err.message)
          setLoadingInst(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!selectedId?.trim()) return
    window.localStorage.setItem(LAST_INSTITUTION_ID_STORAGE_KEY, selectedId)
  }, [selectedId])

  useEffect(() => {
    const unsubs: (() => void)[] = []

    async function run() {
      if (!db || !selectedId) {
        setStudents([])
        setTrails([])
        setStudentTrails([])
        setConversationLogs([])
        setStages([])
        setQuestions([])
        setDataError(null)
        setLoadingData(false)
        setLoadingLogs(false)
        setLoadStepsDone(0)
        setLoadStepsTotal(DATA_SOURCES + 1)
        loadProgressRef.current = { done: 0, total: DATA_SOURCES + 1 }
        setLoadPercent(0)
        setLoadLabel('')
        return
      }

      loadProgressRef.current = { done: 0, total: DATA_SOURCES + 1 }
      setLoadingData(true)
      setLoadStepsDone(0)
      setLoadStepsTotal(DATA_SOURCES + 1)
      setLoadPercent(0)
      setLoadLabel('Carregando alunos e trilhas…')
      const dbOk = db
      const loadedSources = new Set<string>()

    const done = (source: string) => {
      if (loadedSources.has(source)) return
      loadedSources.add(source)
      loadProgressRef.current.done += 1
      syncLoadProgress('Carregando alunos e trilhas…')
      if (loadedSources.size >= DATA_SOURCES) {
        setLoadingData(false)
      }
    }

    const onError = (
      setData: (items: never[]) => void,
      source: string,
    ) => {
      return (err: { message: string }) => {
        setDataError(err.message)
        setData([])
        done(source)
      }
    }

    unsubs.push(
      onSnapshot(
        query(
          collection(dbOk, STUDENTS_COLLECTION),
          where('institution_id', '==', selectedId),
        ),
        (snap) => {
          const studentList = snap.docs.map(snapshotToStudent)
          setStudents(studentList)
          setDataError(null)
          const ids = studentList.map((s) => s.id).filter(Boolean)
          const logChunks =
            ids.length > 0
              ? chunkArray(ids, FIRESTORE_IN_LIMIT).length
              : 1
          loadProgressRef.current.total = DATA_SOURCES + logChunks
          setLoadStepsTotal(loadProgressRef.current.total)
          done('students')
        },
        onError(setStudents, 'students'),
      ),
    )
    unsubs.push(
      onSnapshot(
        query(
          collection(dbOk, TRAILS_COLLECTION),
          where('institution_id', '==', selectedId),
        ),
        (snap) => {
          setTrails(snap.docs.map(snapshotToTrail))
          setDataError(null)
          done('trails')
        },
        onError(setTrails, 'trails'),
      ),
    )
    unsubs.push(
      onSnapshot(
        query(
          collection(dbOk, STUDENT_TRAILS_COLLECTION),
          where('institution_id', '==', selectedId),
        ),
        (snap) => {
          setStudentTrails(snap.docs.map(snapshotToStudentTrail))
          setDataError(null)
          done('studentTrails')
        },
        onError(setStudentTrails, 'studentTrails'),
      ),
    )
    const onMetadataError = (
      setData: (items: never[]) => void,
    ) => {
      return (err: { message: string }) => {
        setDataError(err.message)
        setData([])
      }
    }

    // Stages e questões não têm institution_id; carrega tudo e filtra
    // pelas trilhas da instituição (volume pequeno no client).
    unsubs.push(
      onSnapshot(
        collection(dbOk, TRAIL_STAGES_COLLECTION),
        (snap) => {
          setStages(snap.docs.map(snapshotToTrailStage))
        },
        onMetadataError(setStages),
      ),
    )
    unsubs.push(
      onSnapshot(
        collection(dbOk, TRAIL_STAGE_QUESTIONS_COLLECTION),
        (snap) => {
          setQuestions(snap.docs.map(snapshotToTrailStageQuestion))
        },
        onMetadataError(setQuestions),
      ),
    )
    }

    void run()
    return () => {
      for (const u of unsubs) u()
    }
  }, [selectedId])

  const studentIdsKey = useMemo(
    () =>
      students
        .map((s) => s.id)
        .filter(Boolean)
        .sort()
        .join('\0'),
    [students],
  )

  const trailIdsKey = useMemo(
    () =>
      trails
        .map((t) => t.id)
        .filter(Boolean)
        .sort()
        .join('\0'),
    [trails],
  )

  useEffect(() => {
    let cancelled = false

    if (!db || !selectedId || loadingData) {
      return () => {
        cancelled = true
      }
    }

    const studentIds = studentIdsKey ? studentIdsKey.split('\0') : []
    if (studentIds.length === 0) {
      setConversationLogs([])
      setLoadingLogs(false)
      loadProgressRef.current.done = loadProgressRef.current.total
      setLoadStepsDone(loadProgressRef.current.total)
      setLoadPercent(100)
      setLoadLabel('')
      return () => {
        cancelled = true
      }
    }

    const relevantTrailIds = new Set(
      trailIdsKey ? trailIdsKey.split('\0') : [],
    )

    const logChunks = chunkArray(studentIds, FIRESTORE_IN_LIMIT).length
    loadProgressRef.current.total = DATA_SOURCES + logChunks
    setLoadStepsTotal(loadProgressRef.current.total)

    setLoadingLogs(true)
    syncLoadProgress('Carregando respostas dos alunos…')
    void fetchConversationLogsForStudents(
      studentIds,
      relevantTrailIds,
      (completed, total) => {
        if (cancelled) return
        loadProgressRef.current.done = DATA_SOURCES + completed
        loadProgressRef.current.total = DATA_SOURCES + total
        syncLoadProgress('Carregando respostas dos alunos…')
      },
    )
      .then((logs) => {
        if (cancelled) return
        setConversationLogs(logs)
        setLoadingLogs(false)
        loadProgressRef.current.done = loadProgressRef.current.total
        setLoadStepsDone(loadProgressRef.current.total)
        setLoadPercent(100)
        setLoadLabel('')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDataError(err instanceof Error ? err.message : 'Erro ao carregar logs')
        setConversationLogs([])
        setLoadingLogs(false)
        setLoadPercent(0)
        setLoadLabel('')
      })

    return () => {
      cancelled = true
    }
  }, [selectedId, studentIdsKey, trailIdsKey, loadingData])

  const sortedInstitutions = useMemo(() => {
    return filterInstitutions(institutions).sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [institutions, filterInstitutions])

  const activeTrails = useMemo(() => trails.filter((t) => t.active), [trails])

  const subjects = useMemo(() => {
    const set = new Set<string>()
    for (const t of activeTrails) {
      const s = t.subject?.trim()
      if (s) set.add(s)
    }
    return [...set].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    )
  }, [activeTrails])

  const trailById = useMemo(() => {
    const map = new Map<string, Trail>()
    for (const t of trails) map.set(t.id, t)
    return map
  }, [trails])

  const stageByKey = useMemo(() => {
    const map = new Map<string, TrailStage>()
    for (const s of stages) map.set(`${s.trail_id}|${s.stage_number}`, s)
    return map
  }, [stages])

  const questionByKey = useMemo(() => {
    const map = new Map<string, TrailStageQuestion>()
    for (const q of questions) {
      map.set(`${q.trail_id}|${q.stage_number}|${q.question_number}`, q)
    }
    return map
  }, [questions])

  /**
   * Posições (stage/question) de todas as questões ativas, por trilha.
   * Não filtra por is_released: uma questão respondida e bloqueada depois
   * continua contando.
   */
  const questionsByTrail = useMemo(() => {
    const map = new Map<string, { stage: number; question: number }[]>()
    for (const q of questions) {
      if (q.active === false) continue
      const arr = map.get(q.trail_id)
      if (arr) arr.push({ stage: q.stage_number, question: q.question_number })
      else map.set(q.trail_id, [{ stage: q.stage_number, question: q.question_number }])
    }
    return map
  }, [questions])

  /** Questões de exercício sem gabarito nas trilhas ativas da instituição. */
  const missingGabaritoCount = useMemo(() => {
    const activeIds = new Set(activeTrails.map((t) => t.id))
    let count = 0
    for (const q of questions) {
      if (!activeIds.has(q.trail_id)) continue
      const stage = stageByKey.get(`${q.trail_id}|${q.stage_number}`)
      if (stage?.stage_type !== 'exercise') continue
      if (!(q.correct_option ?? '').trim()) count += 1
    }
    return count
  }, [questions, activeTrails, stageByKey])

  /** Trilhas consideradas nos números da tabela de alunos (filtro de matéria). */
  const relevantTrails = useMemo(() => {
    if (!subjectFilter) return activeTrails
    return activeTrails.filter((t) => t.subject?.trim() === subjectFilter)
  }, [activeTrails, subjectFilter])

  /** Stages das trilhas relevantes, para o filtro de seleção (agrupados por trilha). */
  const availableStages = useMemo(() => {
    const relevantIds = new Set(relevantTrails.map((t) => t.id))
    const list = stages
      .filter((s) => relevantIds.has(s.trail_id))
      .map((s) => ({
        key: `${s.trail_id}|${s.stage_number}`,
        trailId: s.trail_id,
        trailName: trailById.get(s.trail_id)?.name || s.trail_id,
        stageNumber: s.stage_number,
        title: s.title,
        stageType: s.stage_type,
      }))
    list.sort((a, b) =>
      a.trailName !== b.trailName
        ? a.trailName.localeCompare(b.trailName, 'pt-BR', {
            sensitivity: 'base',
          })
        : a.stageNumber - b.stageNumber,
    )
    return list
  }, [stages, relevantTrails, trailById])

  const selectedStageCount = useMemo(
    () =>
      availableStages.filter((s) => !deselectedStages.has(s.key)).length,
    [availableStages, deselectedStages],
  )

  /** Números de questão (q1, q2…) presentes nas trilhas relevantes. */
  const availableQuestions = useMemo(() => {
    const relevantIds = new Set(relevantTrails.map((t) => t.id))
    const nums = new Set<number>()
    for (const q of questions) {
      if (q.active === false) continue
      if (!relevantIds.has(q.trail_id)) continue
      if (q.question_number >= 1) nums.add(q.question_number)
    }
    return [...nums].sort((a, b) => a - b)
  }, [questions, relevantTrails])

  const selectedQuestionCount = useMemo(
    () =>
      availableQuestions.filter((n) => !deselectedQuestions.has(n)).length,
    [availableQuestions, deselectedQuestions],
  )

  const logAggregates = useMemo(
    () => buildLogAggregates(conversationLogs),
    [conversationLogs],
  )

  const doneQuestionsByStudent = logAggregates.doneByStudent
  const studentAnswerMap = logAggregates.answerMap

  /**
   * Todas as questões ativas da trilha (colunas de resposta no XLSX), agrupadas
   * por número da questão: Q1.S1, Q1.S2, …, Q2.S1, Q2.S2, …
   */
  const allQuestionColumnsByTrail = useMemo(() => {
    const map = new Map<string, { stage: number; question: number }[]>()
    for (const [trailId, positions] of questionsByTrail) {
      map.set(
        trailId,
        [...positions].sort((a, b) =>
          a.question !== b.question
            ? a.question - b.question
            : a.stage - b.stage,
        ),
      )
    }
    return map
  }, [questionsByTrail])

  const studentRows = useMemo<StudentRow[]>(() => {
    const relevantIds = new Set(relevantTrails.map((t) => t.id))

    // Trilhas inscritas (com progresso) de cada aluno, restritas às trilhas
    // relevantes (ativas + filtro de matéria).
    const trailsByStudent = new Map<string, StudentTrail[]>()
    for (const st of studentTrails) {
      if (!relevantIds.has(st.trail_id)) continue
      const arr = trailsByStudent.get(st.student_id)
      if (arr) arr.push(st)
      else trailsByStudent.set(st.student_id, [st])
    }

    const attemptsByStudent = new Map<string, { correct: number; wrong: number }>()
    for (const student of students) {
      const enrolled = trailsByStudent.get(student.id) ?? []
      const enrolledTrailIds = new Set(enrolled.map((st) => st.trail_id))
      attemptsByStudent.set(
        student.id,
        scoreStudentFromAnswerMap(
          student.id,
          enrolledTrailIds,
          studentAnswerMap,
          stageByKey,
          questionByKey,
          deselectedStages,
          deselectedQuestions,
        ),
      )
    }

    const rows: StudentRow[] = students.map((student) => {
      let released = 0
      let done = 0
      const enrolled = trailsByStudent.get(student.id) ?? []
      const studentDone = doneQuestionsByStudent.get(student.id) ?? new Set()
      for (const st of enrolled) {
        const positions = questionsByTrail.get(st.trail_id) ?? []
        const selected = positions.filter(
          (p) =>
            !deselectedStages.has(`${st.trail_id}|${p.stage}`) &&
            !deselectedQuestions.has(p.question),
        )
        released += selected.length

        for (const p of selected) {
          const key = `${st.trail_id}|${p.stage}|${p.question}`
          if (studentDone.has(key)) done += 1
        }
      }

      const agg = attemptsByStudent.get(student.id) ?? { correct: 0, wrong: 0 }
      return {
        student,
        released,
        done,
        completionPct: pct(done, released),
        correct: agg.correct,
        wrong: agg.wrong,
        accuracyPct: pct(agg.correct, agg.correct + agg.wrong),
      }
    })

    return rows
  }, [
    students,
    relevantTrails,
    studentTrails,
    questionsByTrail,
    stageByKey,
    questionByKey,
    deselectedStages,
    deselectedQuestions,
    doneQuestionsByStudent,
    studentAnswerMap,
  ])

  const filteredStudentRows = useMemo(() => {
    const name = nameFilter.trim().toLowerCase()
    const lo = Math.min(pctMin, pctMax)
    const hi = Math.max(pctMin, pctMax)
    return studentRows.filter((row) => {
      if (name && !row.student.name.toLowerCase().includes(name)) return false
      const p = row.completionPct ?? 0
      if (p < lo || p > hi) return false
      return true
    })
  }, [studentRows, nameFilter, pctMin, pctMax])

  const sortedFilteredStudentRows = useMemo(() => {
    const rows = [...filteredStudentRows]
    const { key, dir } = studentSort
    const mult = dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      let cmp = 0
      switch (key) {
        case 'name':
          cmp = (a.student.name || '').localeCompare(
            b.student.name || '',
            'pt-BR',
            { sensitivity: 'base' },
          )
          break
        case 'phone':
          cmp = (a.student.phone_number || '').localeCompare(
            b.student.phone_number || '',
            'pt-BR',
            { sensitivity: 'base' },
          )
          break
        case 'released':
          cmp = a.released - b.released
          break
        case 'done':
          cmp = a.done - b.done
          break
        case 'completionPct':
          cmp = compareNullableNumber(a.completionPct, b.completionPct)
          break
        case 'correct':
          cmp = a.correct - b.correct
          break
        case 'wrong':
          cmp = a.wrong - b.wrong
          break
        case 'accuracyPct':
          cmp = compareNullableNumber(a.accuracyPct, b.accuracyPct)
          break
      }
      return cmp * mult
    })
    return rows
  }, [filteredStudentRows, studentSort])

  // Cards de resumo
  const summary = useMemo(() => {
    const activeStudents = students.filter((s) => s.active)
    const completionVals = studentRows
      .filter((r) => r.student.active)
      .map((r) => r.completionPct)
      .filter((v): v is number => v !== null)
    const avgCompletion =
      completionVals.length > 0
        ? Math.round(
            completionVals.reduce((acc, v) => acc + v, 0) /
              completionVals.length,
          )
        : null

    let correct = 0
    let total = 0
    for (const row of studentRows.filter((r) => r.student.active)) {
      correct += row.correct
      total += row.correct + row.wrong
    }

    return {
      activeStudents: activeStudents.length,
      activeTrails: activeTrails.length,
      avgCompletion,
      avgAccuracy: pct(correct, total),
    }
  }, [students, studentRows, activeTrails])

  // Ranking de pílulas — itera só respostas existentes no mapa
  const gradablePillQuestions = useMemo(() => {
    const map = new Map<string, string>()
    for (const trail of activeTrails) {
      if (pillSubjectFilter && trail.subject?.trim() !== pillSubjectFilter) {
        continue
      }
      const positions = questionsByTrail.get(trail.id) ?? []
      for (const p of positions) {
        const stage = stageByKey.get(`${trail.id}|${p.stage}`)
        if (stage?.stage_type !== 'exercise') continue

        const key = `${trail.id}|${p.stage}|${p.question}`
        const gabarito = (questionByKey.get(key)?.correct_option ?? '').trim()
        if (!gabarito) continue
        map.set(key, gabarito)
      }
    }
    return map
  }, [
    activeTrails,
    questionsByTrail,
    stageByKey,
    questionByKey,
    pillSubjectFilter,
  ])

  const pillRows = useMemo<PillRow[]>(() => {
    const byKey = new Map<string, { correct: number; wrong: number }>()

    for (const [answerKey, answer] of studentAnswerMap) {
      if (!answer.trim()) continue

      const parts = answerKey.split('|')
      if (parts.length !== 4) continue

      const qKey = `${parts[1]}|${parts[2]}|${parts[3]}`
      const gabarito = gradablePillQuestions.get(qKey)
      if (!gabarito) continue

      let agg = byKey.get(qKey)
      if (!agg) {
        agg = { correct: 0, wrong: 0 }
        byKey.set(qKey, agg)
      }

      if (answersMatch(answer, gabarito)) agg.correct += 1
      else agg.wrong += 1
    }

    const rows: PillRow[] = []
    for (const [key, agg] of byKey) {
      const [trailId, stageStr, questionStr] = key.split('|')
      const stageNumber = Number(stageStr)
      const questionNumber = Number(questionStr)
      const trail = trailById.get(trailId)
      const question = questionByKey.get(key)
      const total = agg.correct + agg.wrong
      if (total < pillMinResponses) continue
      rows.push({
        key,
        trailId,
        trailName: trail?.name || trailId,
        subject: trail?.subject?.trim() || '—',
        stageNumber,
        questionNumber,
        title: question?.title || '—',
        total,
        correct: agg.correct,
        wrong: agg.wrong,
        accuracyPct: Math.round((agg.correct / total) * 100),
      })
    }
    return rows
  }, [
    studentAnswerMap,
    gradablePillQuestions,
    trailById,
    questionByKey,
    pillMinResponses,
  ])

  const sortedPillRows = useMemo(() => {
    const rows = [...pillRows]
    const { key, dir } = pillSort
    const mult = dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      let cmp = 0
      switch (key) {
        case 'trail':
          cmp = a.trailName.localeCompare(b.trailName, 'pt-BR', {
            sensitivity: 'base',
          })
          break
        case 'position':
          cmp =
            a.stageNumber !== b.stageNumber
              ? a.stageNumber - b.stageNumber
              : a.questionNumber - b.questionNumber
          break
        case 'total':
          cmp = a.total - b.total
          break
        case 'correct':
          cmp = a.correct - b.correct
          break
        case 'wrong':
          cmp = a.wrong - b.wrong
          break
        case 'accuracyPct':
          cmp = a.accuracyPct - b.accuracyPct
          break
      }
      return cmp * mult
    })
    return rows
  }, [pillRows, pillSort])

  const worstPills = useMemo(
    () => [...pillRows].sort((a, b) => a.accuracyPct - b.accuracyPct).slice(0, 5),
    [pillRows],
  )
  const bestPills = useMemo(
    () => [...pillRows].sort((a, b) => b.accuracyPct - a.accuracyPct).slice(0, 5),
    [pillRows],
  )

  function togglePillSort(key: PillSortKey) {
    setPillSort((curr) =>
      curr.key === key
        ? { key, dir: curr.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'accuracyPct' ? 'asc' : 'desc' },
    )
  }

  function toggleStudentSort(key: StudentSortKey) {
    setStudentSort((curr) =>
      curr.key === key
        ? { key, dir: curr.dir === 'asc' ? 'desc' : 'asc' }
        : {
            key,
            dir: key === 'name' || key === 'phone' ? 'asc' : 'desc',
          },
    )
  }

  function pillSortIndicator(key: PillSortKey): string {
    if (pillSort.key !== key) return ''
    return pillSort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  function studentSortIndicator(key: StudentSortKey): string {
    if (studentSort.key !== key) return ''
    return studentSort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  function toggleColumn(key: StudentColumnKey) {
    setHiddenColumns((curr) => {
      const next = new Set(curr)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleStage(key: string) {
    setDeselectedStages((curr) => {
      const next = new Set(curr)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleQuestion(questionNumber: number) {
    setDeselectedQuestions((curr) => {
      const next = new Set(curr)
      if (next.has(questionNumber)) next.delete(questionNumber)
      else next.add(questionNumber)
      return next
    })
  }

  function computeTrailMetrics(
    studentId: string,
    trailId: string,
    doneOverride?: Map<string, Set<string>>,
  ): { released: number; done: number; completionPct: number | null } {
    const enrolled = studentTrails.some(
      (st) => st.student_id === studentId && st.trail_id === trailId,
    )
    if (!enrolled) {
      return { released: 0, done: 0, completionPct: null }
    }

    const positions = questionsByTrail.get(trailId) ?? []
    const selected = positions.filter(
      (p) =>
        !deselectedStages.has(`${trailId}|${p.stage}`) &&
        !deselectedQuestions.has(p.question),
    )
    const studentDone =
      doneOverride?.get(studentId) ??
      doneQuestionsByStudent.get(studentId) ??
      new Set()
    let done = 0
    for (const p of selected) {
      const key = `${trailId}|${p.stage}|${p.question}`
      if (studentDone.has(key)) done += 1
    }
    const released = selected.length
    return { released, done, completionPct: pct(done, released) }
  }

  async function exportTrailHistoryXlsx(trail: Trail) {
    if (!db || exportingTrailId) return
    setExportError(null)
    setExportingTrailId(trail.id)
    try {
      const studentIds = students.map((s) => s.id).filter(Boolean)
      const relevantTrailIds = new Set(trails.map((t) => t.id))
      const logs = await fetchConversationLogsForStudents(
        studentIds,
        relevantTrailIds,
      )
      const { answerMap: answersByKey, doneByStudent: exportDoneByStudent } =
        buildLogAggregates(logs)

      const answerColumns = allQuestionColumnsByTrail.get(trail.id) ?? []
      const fixedHeaders = [
        'Nome',
        'Telefone',
        'Questões liberadas',
        'Questões feitas',
        '% conclusão',
      ]
      const headers = [
        ...fixedHeaders,
        ...answerColumns.map((p) => stageQuestionColumn(p.stage, p.question)),
      ]

      const sortedStudents = [...students].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'pt-BR', {
          sensitivity: 'base',
        }),
      )

      const rows = sortedStudents.map((student) => {
        const metrics = computeTrailMetrics(
          student.id,
          trail.id,
          exportDoneByStudent,
        )
        const row: (string | number)[] = [
          student.name || student.id,
          student.phone_number || '',
          metrics.released,
          metrics.done,
          formatPctExport(metrics.completionPct),
        ]
        for (const p of answerColumns) {
          const stageExcluded = deselectedStages.has(`${trail.id}|${p.stage}`)
          const questionExcluded = deselectedQuestions.has(p.question)
          if (stageExcluded || questionExcluded) {
            row.push('')
            continue
          }
          const answerKey = `${student.id}|${trail.id}|${p.stage}|${p.question}`
          row.push(answersByKey.get(answerKey) ?? '')
        }
        return row
      })

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const fixedColCount = fixedHeaders.length

      headers.forEach((header, colIndex) => {
        forceWorksheetCellString(worksheet, 0, colIndex, header)
      })

      rows.forEach((row, rowIndex) => {
        for (let colIndex = fixedColCount; colIndex < headers.length; colIndex++) {
          const value = row[colIndex]
          if (typeof value === 'string' && value.length > 0) {
            forceWorksheetCellString(worksheet, rowIndex + 1, colIndex, value)
          }
        }
      })

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Histórico')
      const trailSlug = slugFileName(trail.name || trail.id)
      XLSX.writeFile(workbook, `historico-alunos-${trailSlug}.xlsx`)
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao gerar planilha.',
      )
    } finally {
      setExportingTrailId(null)
    }
  }

  const visibleColumns = ALL_STUDENT_COLUMNS.filter(
    (c) => !hiddenColumns.has(c.key),
  )

  const isDashboardLoading =
    Boolean(selectedId) && (loadingData || loadingLogs)

  useEffect(() => {
    if (!isDashboardLoading) return

    const id = window.setInterval(() => {
      const target = getLoadTargetPercent()
      setLoadPercent((current) => {
        if (current < target) return Math.min(current + 1, target)
        return current
      })
    }, 40)

    return () => window.clearInterval(id)
  }, [isDashboardLoading, loadStepsDone, loadStepsTotal])

  return (
    <>
      <header className="admin__header">
        <h1>Dashboard</h1>
        {!isDashboardLoading ? (
          <p className="admin__lede muted">
            Visão geral de engajamento dos alunos e desempenho por pílula
            (questão de exercício).
          </p>
        ) : null}
        <div className="gerenciamento-toolbar">
          <Link className="btn btn--ghost" to="/">
            ← Início
          </Link>
          <label className="gerenciamento-select">
            <span className="muted">Instituição</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => {
                const next = e.target.value.trim()
                setSelectedId(next || null)
              }}
              disabled={loadingInst || sortedInstitutions.length === 0}
            >
              <option value="">
                {loadingInst
                  ? 'Carregando instituições…'
                  : 'Selecione uma instituição'}
              </option>
              {sortedInstitutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name || inst.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {instError ? (
        <p className="banner banner--error" role="alert">
          {instError}
        </p>
      ) : null}
      {dataError ? (
        <p className="banner banner--error" role="alert">
          {dataError}
        </p>
      ) : null}
      {exportError ? (
        <p className="banner banner--error" role="alert">
          {exportError}
        </p>
      ) : null}

      {!selectedId ? (
        <section className="panel">
          <p className="muted gerenciamento-placeholder">
            Selecione uma instituição para ver o dashboard.
          </p>
        </section>
      ) : isDashboardLoading ? (
        <section
          className="dashboard-load-progress dashboard-load-progress--gate panel"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="dashboard-load-progress__head">
            <span className="dashboard-load-progress__label">
              {loadLabel || 'Carregando dashboard…'}
            </span>
            <span className="dashboard-load-progress__pct">{loadPercent}%</span>
          </div>
          <div
            className="progress progress--wide"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={loadPercent}
            aria-label={loadLabel || 'Progresso do carregamento'}
          >
            <div className="progress__bar">
              <div
                className="progress__fill"
                style={{ width: `${loadPercent}%` }}
              />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="dashboard-cards">
            <div className="dashboard-card">
              <span className="dashboard-card__label">Alunos ativos</span>
              <span className="dashboard-card__value">
                {summary.activeStudents}
              </span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card__label">Trilhas ativas</span>
              <span className="dashboard-card__value">
                {summary.activeTrails}
              </span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card__label">% médio de conclusão</span>
              <span className="dashboard-card__value">
                {formatPct(summary.avgCompletion)}
              </span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card__label">% médio de acerto</span>
              <span className="dashboard-card__value">
                {formatPct(summary.avgAccuracy)}
              </span>
            </div>
            {missingGabaritoCount > 0 ? (
              <Link to="/gabarito" className="dashboard-card dashboard-card--warn">
                <span className="dashboard-card__label">
                  Questões sem gabarito
                </span>
                <span className="dashboard-card__value">
                  {missingGabaritoCount}
                </span>
                <span className="dashboard-card__hint">
                  Preencher gabarito →
                </span>
              </Link>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Alunos</h2>
              <p className="admin__actions gerenciamento-detail-actions">
                <span className="muted">
                  {filteredStudentRows.length} de {studentRows.length} alunos
                </span>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    setShowQuestionPicker((v) => !v)
                    setShowStagePicker(false)
                  }}
                >
                  Aulas
                  {availableQuestions.length > 0
                    ? ` (${selectedQuestionCount}/${availableQuestions.length})`
                    : ''}
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    setShowStagePicker((v) => !v)
                    setShowQuestionPicker(false)
                  }}
                >
                  Tópicos
                  {availableStages.length > 0
                    ? ` (${selectedStageCount}/${availableStages.length})`
                    : ''}
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    setShowColumnPicker((v) => !v)
                    setShowStagePicker(false)
                    setShowQuestionPicker(false)
                  }}
                >
                  Colunas
                </button>
                {relevantTrails.map((trail) => (
                  <button
                    key={trail.id}
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={
                      students.length === 0 || exportingTrailId !== null
                    }
                    onClick={() => void exportTrailHistoryXlsx(trail)}
                    title="Respostas do aluno por questão/stage; métricas respeitam filtros Stages/Questões"
                  >
                    {exportingTrailId === trail.id
                      ? 'Gerando XLSX…'
                      : `Baixar XLSX — ${trail.name || trail.id}`}
                  </button>
                ))}
              </p>
            </div>

            {showQuestionPicker ? (
              <div className="dashboard-column-picker">
                <div className="dashboard-stage-picker__head">
                  <span className="muted">
                    Questões incluídas no cálculo de liberadas/feitas (por
                    número no stage: q1, q2…).
                  </span>
                  <span className="dashboard-stage-picker__actions">
                    <button
                      type="button"
                      className="table__name-link table__name-link--button"
                      onClick={() => setDeselectedQuestions(new Set())}
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      className="table__name-link table__name-link--button"
                      onClick={() =>
                        setDeselectedQuestions(new Set(availableQuestions))
                      }
                    >
                      Desmarcar todas
                    </button>
                  </span>
                </div>
                {availableQuestions.length === 0 ? (
                  <span className="muted">
                    Nenhuma questão nas trilhas atuais.
                  </span>
                ) : (
                  availableQuestions.map((n) => (
                    <label key={n} className="field field--inline">
                      <input
                        type="checkbox"
                        checked={!deselectedQuestions.has(n)}
                        onChange={() => toggleQuestion(n)}
                      />
                      <span>Questão {n}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}

            {showStagePicker ? (
              <div className="dashboard-stage-picker">
                <div className="dashboard-stage-picker__head">
                  <span className="muted">
                    Stages incluídos no cálculo de questões liberadas/feitas.
                  </span>
                  <span className="dashboard-stage-picker__actions">
                    <button
                      type="button"
                      className="table__name-link table__name-link--button"
                      onClick={() => setDeselectedStages(new Set())}
                    >
                      Marcar todos
                    </button>
                    <button
                      type="button"
                      className="table__name-link table__name-link--button"
                      onClick={() =>
                        setDeselectedStages(
                          new Set(availableStages.map((s) => s.key)),
                        )
                      }
                    >
                      Desmarcar todos
                    </button>
                  </span>
                </div>
                <div className="dashboard-stage-picker__list">
                  {availableStages.length === 0 ? (
                    <span className="muted">
                      Nenhum stage nas trilhas atuais.
                    </span>
                  ) : (
                    availableStages.map((s) => (
                      <label key={s.key} className="field field--inline">
                        <input
                          type="checkbox"
                          checked={!deselectedStages.has(s.key)}
                          onChange={() => toggleStage(s.key)}
                        />
                        <span>
                          {s.trailName} · Stage {s.stageNumber}
                          {s.title ? ` — ${s.title}` : ''}{' '}
                          <span className="muted">({s.stageType})</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {showColumnPicker ? (
              <div className="dashboard-column-picker">
                {ALL_STUDENT_COLUMNS.map((c) => (
                  <label key={c.key} className="field field--inline">
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="dashboard-filters">
              <label className="field dashboard-filter-name">
                <span>Buscar por nome</span>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Nome do aluno…"
                />
              </label>
              <label className="gerenciamento-select">
                <span className="muted">Matéria</span>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                >
                  <option value="">Todas as matérias</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dashboard-pct-filter">
                <span className="muted">
                  % conclusão: {Math.min(pctMin, pctMax)}–{Math.max(pctMin, pctMax)}%
                </span>
                <div className="dashboard-pct-filter__sliders">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pctMin}
                    onChange={(e) => setPctMin(Number(e.target.value))}
                    aria-label="Percentual mínimo de conclusão"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pctMax}
                    onChange={(e) => setPctMax(Number(e.target.value))}
                    aria-label="Percentual máximo de conclusão"
                  />
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th
                      className="dashboard-sortable"
                      onClick={() => toggleStudentSort('name')}
                    >
                      Nome{studentSortIndicator('name')}
                    </th>
                    {visibleColumns.map((c) => (
                      <th
                        key={c.key}
                        className="dashboard-sortable"
                        onClick={() => toggleStudentSort(c.key)}
                      >
                        {c.label}
                        {studentSortIndicator(c.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="muted table__empty"
                      >
                        {studentRows.length === 0
                          ? 'Nenhum aluno nesta instituição.'
                          : 'Nenhum aluno corresponde aos filtros.'}
                      </td>
                    </tr>
                  ) : (
                    sortedFilteredStudentRows.map((row) => (
                      <tr key={row.student.id}>
                        <td>
                          <Link
                            className="table__name-link"
                            to={studentPath(row.student.id)}
                          >
                            {row.student.name || '—'}
                          </Link>
                        </td>
                        {visibleColumns.map((c) => {
                          switch (c.key) {
                            case 'phone':
                              return (
                                <td key={c.key}>
                                  {row.student.phone_number || '—'}
                                </td>
                              )
                            case 'released':
                              return <td key={c.key}>{row.released}</td>
                            case 'done':
                              return <td key={c.key}>{row.done}</td>
                            case 'completionPct':
                              return (
                                <td key={c.key}>
                                  <div className="progress">
                                    <div className="progress__bar">
                                      <div
                                        className="progress__fill"
                                        style={{
                                          width: `${row.completionPct ?? 0}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="progress__label">
                                      {formatPct(row.completionPct)}
                                    </span>
                                  </div>
                                </td>
                              )
                            case 'correct':
                              return <td key={c.key}>{row.correct}</td>
                            case 'wrong':
                              return <td key={c.key}>{row.wrong}</td>
                            case 'accuracyPct':
                              return (
                                <td key={c.key}>
                                  {formatPct(row.accuracyPct)}
                                </td>
                              )
                          }
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Pílulas — acertos e erros</h2>
            </div>

            {pillRows.length === 0 ? (
              <p className="banner">
                Sem respostas corrigíveis ainda. Os acertos e erros aparecem
                aqui quando os alunos responderem questões de exercício com
                gabarito preenchido.{' '}
                <Link to="/gabarito">Preencher gabarito →</Link>
              </p>
            ) : (
              <>
                <div className="dashboard-filters">
                  <label className="gerenciamento-select">
                    <span className="muted">Matéria</span>
                    <select
                      value={pillSubjectFilter}
                      onChange={(e) => setPillSubjectFilter(e.target.value)}
                    >
                      <option value="">Todas as matérias</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field dashboard-filter-min">
                    <span>Mínimo de respostas</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={pillMinResponses}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10)
                        setPillMinResponses(
                          Number.isFinite(n) && n >= 1 ? n : 1,
                        )
                      }}
                    />
                  </label>
                </div>

                {pillRows.length > 0 ? (
                  <div className="dashboard-top-pills">
                    <div className="dashboard-top-pills__group">
                      <h3>Top 5 piores (menor % de acerto)</h3>
                      <ol>
                        {worstPills.map((p) => (
                          <li key={p.key}>
                            <span className="dashboard-top-pills__pct dashboard-top-pills__pct--bad">
                              {p.accuracyPct}%
                            </span>{' '}
                            <code>
                              s{p.stageNumber} q{p.questionNumber}
                            </code>{' '}
                            {p.title} <span className="muted">({p.trailName})</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="dashboard-top-pills__group">
                      <h3>Top 5 melhores (maior % de acerto)</h3>
                      <ol>
                        {bestPills.map((p) => (
                          <li key={p.key}>
                            <span className="dashboard-top-pills__pct dashboard-top-pills__pct--good">
                              {p.accuracyPct}%
                            </span>{' '}
                            <code>
                              s{p.stageNumber} q{p.questionNumber}
                            </code>{' '}
                            {p.title} <span className="muted">({p.trailName})</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                ) : null}

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('trail')}
                        >
                          Trilha{pillSortIndicator('trail')}
                        </th>
                        <th>Matéria</th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('position')}
                        >
                          Stage/Questão{pillSortIndicator('position')}
                        </th>
                        <th>Título</th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('total')}
                        >
                          Respostas{pillSortIndicator('total')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('correct')}
                        >
                          Acertos{pillSortIndicator('correct')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('wrong')}
                        >
                          Erros{pillSortIndicator('wrong')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => togglePillSort('accuracyPct')}
                        >
                          % acerto{pillSortIndicator('accuracyPct')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPillRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="muted table__empty">
                            Nenhuma pílula com pelo menos {pillMinResponses}{' '}
                            {pillMinResponses === 1 ? 'resposta' : 'respostas'}.
                          </td>
                        </tr>
                      ) : (
                        sortedPillRows.map((p) => (
                          <tr key={p.key}>
                            <td>
                              <Link
                                className="table__name-link"
                                to={trailPath(p.trailId)}
                              >
                                {p.trailName}
                              </Link>
                            </td>
                            <td>{p.subject}</td>
                            <td>
                              <code>
                                s{p.stageNumber} q{p.questionNumber}
                              </code>
                            </td>
                            <td>{p.title}</td>
                            <td>{p.total}</td>
                            <td>{p.correct}</td>
                            <td>{p.wrong}</td>
                            <td>
                              <div className="progress">
                                <div className="progress__bar">
                                  <div
                                    className="progress__fill"
                                    style={{ width: `${p.accuracyPct}%` }}
                                  />
                                </div>
                                <span className="progress__label">
                                  {p.accuracyPct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
