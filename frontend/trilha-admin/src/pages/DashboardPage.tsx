import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import type * as XLSX from 'xlsx'
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { DashboardPageView } from '../design/views/DashboardPageView'
import {
  DASHBOARD_STUDENT_COLUMNS,
  type DashboardPillRowView,
  type DashboardStudentChartFilter,
  type DashboardStudentColumnKey,
  type DashboardStudentSortKey,
  type DashboardTab,
} from '../design/types/dashboardPageView'
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
import { fetchDashboardLogSummary } from '../lib/dashboardSummaryApi'
import { loadXlsx } from '../lib/loadXlsx'
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
const STUDENTS_PAGE_SIZE = 20
const PILLS_PAGE_SIZE = 20
const ALL_STUDENT_COLUMNS = DASHBOARD_STUDENT_COLUMNS

type StudentColumnKey = DashboardStudentColumnKey
type StudentSortKey = DashboardStudentSortKey

type StudentRow = {
  student: Student
  released: number
  done: number
  completionPct: number | null
  lessonsReleased: number
  lessonsDone: number
  lessonsCompletionPct: number | null
  correct: number
  wrong: number
  accuracyPct: number | null
}

type StudentEngagementStatus = 'notStarted' | 'inProgress' | 'completed'

function getStudentEngagementStatus(
  row: StudentRow,
): StudentEngagementStatus {
  const completion = row.completionPct
  if (row.released === 0 || completion === null || completion <= 0) {
    return 'notStarted'
  }
  return completion >= 100 ? 'completed' : 'inProgress'
}

function getCompletionBucketKey(completion: number | null): string | null {
  if (completion === null) return null
  if (completion <= 20) return '0-20'
  if (completion <= 40) return '21-40'
  if (completion <= 60) return '41-60'
  if (completion <= 80) return '61-80'
  return '81-100'
}

type PillRow = {
  key: string
  trailId: string
  trailName: string
  subject: string
  stageNumber: number
  questionNumber: number
  title: string
  content: string
  gabarito: string
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

/** Cabeçalho de coluna na planilha: aula (A) × tópico da aula (T). */
function lessonTopicColumn(topicNumber: number, lessonNumber: number): string {
  return `A${lessonNumber}.T${topicNumber}`
}

function lessonTopicColumnLabel(
  trailId: string,
  topicNumber: number,
  lessonNumber: number,
  stageByKey: Map<string, TrailStage>,
): string {
  const code = lessonTopicColumn(topicNumber, lessonNumber)
  const stageTitle = stageByKey.get(`${trailId}|${topicNumber}`)?.title?.trim()
  return stageTitle ? `${code} - ${stageTitle}` : code
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

/** Exibe gabarito numérico como letra: 1→A, 2→B, 3→C. */
function formatGabaritoLetter(value: string): string {
  const normalized = normalizeAnswer(value).toLowerCase()
  if (!normalized) return '—'
  const fromNumber: Record<string, string> = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
  }
  if (fromNumber[normalized]) return fromNumber[normalized]
  const upper = normalized.toUpperCase()
  if (upper === 'A' || upper === 'B' || upper === 'C') return upper
  return upper
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
    if (!Number.isFinite(stage) || !Number.isFinite(question)) continue
    if (!enrolledTrailIds.has(trailId)) continue
    if (deselectedStages.has(`${trailId}|${stage}`)) continue
    if (deselectedQuestions.has(question)) continue

    const stageRec = stageByKey.get(`${trailId}|${stage}`)
    if (stageRec?.stage_type !== 'exercise') continue

    const questionRec = questionByKey.get(`${trailId}|${stage}|${question}`)
    // Questão anulada: fora do denominador (nem acerto nem erro).
    if (questionRec?.annulled === true) continue
    const gabarito = (questionRec?.correct_option ?? '').trim()
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
/** Stages e questões (carregados por trilha) também entram no gate de loading. */
const META_SOURCES = 2
/** Passos de progresso: fontes de dados + metadados + 1 passo de métricas (logs). */
const TOTAL_LOAD_STEPS = DATA_SOURCES + META_SOURCES + 1
const LOG_FETCH_BATCH_SIZE = 3

const EMPTY_LOG_AGGREGATES: LogAggregates = {
  doneByStudent: new Map(),
  answerMap: new Map(),
}

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

type XlsxModule = typeof import('xlsx')

function forceWorksheetCellString(
  xlsx: XlsxModule,
  worksheet: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string,
) {
  const ref = xlsx.utils.encode_cell({ r: row, c: col })
  worksheet[ref] = { t: 's', v: value }
}

const CORRESPONDENCE_HEADERS = ['Código', 'Tópico da aula', 'Enunciado'] as const

function buildTrailCorrespondenceRows(
  trailId: string,
  positions: { stage: number; question: number }[],
  stageByKey: Map<string, TrailStage>,
  questionByKey: Map<string, TrailStageQuestion>,
): string[][] {
  return positions.map((p) => {
    const question = questionByKey.get(`${trailId}|${p.stage}|${p.question}`)
    return [
      lessonTopicColumn(p.stage, p.question),
      stageByKey.get(`${trailId}|${p.stage}`)?.title?.trim() ?? '',
      (question?.content ?? question?.title ?? '').trim(),
    ]
  })
}

function appendCorrespondenceSheet(
  xlsx: XlsxModule,
  workbook: XLSX.WorkBook,
  trailId: string,
  positions: { stage: number; question: number }[],
  stageByKey: Map<string, TrailStage>,
  questionByKey: Map<string, TrailStageQuestion>,
) {
  const legendRows = buildTrailCorrespondenceRows(
    trailId,
    positions,
    stageByKey,
    questionByKey,
  )
  const legendSheet = xlsx.utils.aoa_to_sheet([
    [...CORRESPONDENCE_HEADERS],
    ...legendRows,
  ])
  CORRESPONDENCE_HEADERS.forEach((header, colIndex) => {
    forceWorksheetCellString(xlsx, legendSheet, 0, colIndex, header)
  })
  legendRows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value.length > 0) {
        forceWorksheetCellString(xlsx, legendSheet, rowIndex + 1, colIndex, value)
      }
    })
  })
  xlsx.utils.book_append_sheet(workbook, legendSheet, 'Correspondência')
}

type TopicPosition = { stage: number; question: number }

function filterTrailTopicPositions(
  trailId: string,
  positions: TopicPosition[],
  deselectedStages: Set<string>,
  deselectedQuestions: Set<number>,
): TopicPosition[] {
  return positions.filter(
    (p) =>
      !deselectedStages.has(`${trailId}|${p.stage}`) &&
      !deselectedQuestions.has(p.question),
  )
}

function groupTopicsByLesson(positions: TopicPosition[]): Map<number, TopicPosition[]> {
  const byQuestion = new Map<number, TopicPosition[]>()
  for (const p of positions) {
    const arr = byQuestion.get(p.question)
    if (arr) arr.push(p)
    else byQuestion.set(p.question, [p])
  }
  return byQuestion
}

function isLessonCompleteForTrail(
  trailId: string,
  topics: TopicPosition[],
  studentDone: Set<string>,
): boolean {
  return topics.every((p) =>
    studentDone.has(`${trailId}|${p.stage}|${p.question}`),
  )
}

function computeLessonMetricsForTrails(
  trailIds: Iterable<string>,
  questionsByTrail: Map<string, TopicPosition[]>,
  studentDone: Set<string>,
  deselectedStages: Set<string>,
  deselectedQuestions: Set<number>,
): { lessonsReleased: number; lessonsDone: number; lessonsCompletionPct: number | null } {
  const releasedKeys = new Set<string>()
  const doneKeys = new Set<string>()

  for (const trailId of trailIds) {
    const selected = filterTrailTopicPositions(
      trailId,
      questionsByTrail.get(trailId) ?? [],
      deselectedStages,
      deselectedQuestions,
    )
    for (const [questionNumber, topics] of groupTopicsByLesson(selected)) {
      if (topics.length === 0) continue
      const lessonKey = `${trailId}|${questionNumber}`
      releasedKeys.add(lessonKey)
      if (isLessonCompleteForTrail(trailId, topics, studentDone)) {
        doneKeys.add(lessonKey)
      }
    }
  }

  const lessonsReleased = releasedKeys.size
  const lessonsDone = doneKeys.size
  return {
    lessonsReleased,
    lessonsDone,
    lessonsCompletionPct: pct(lessonsDone, lessonsReleased),
  }
}

function trailLessonNumbers(
  trailId: string,
  questionsByTrail: Map<string, TopicPosition[]>,
  deselectedStages: Set<string>,
  deselectedQuestions: Set<number>,
): number[] {
  const selected = filterTrailTopicPositions(
    trailId,
    questionsByTrail.get(trailId) ?? [],
    deselectedStages,
    deselectedQuestions,
  )
  return [...groupTopicsByLesson(selected).keys()].sort((a, b) => a - b)
}

function appendLessonsProgressSheet(
  xlsx: XlsxModule,
  workbook: XLSX.WorkBook,
  trail: Trail,
  students: Student[],
  questionsByTrail: Map<string, TopicPosition[]>,
  doneByStudent: Map<string, Set<string>>,
  deselectedStages: Set<string>,
  deselectedQuestions: Set<number>,
) {
  const lessonNumbers = trailLessonNumbers(
    trail.id,
    questionsByTrail,
    deselectedStages,
    deselectedQuestions,
  )
  const lessonHeaders = lessonNumbers.map((n) => `A${n}`)
  const headers = [
    'Nome',
    'Telefone',
    ...lessonHeaders,
    'Qtd aulas',
    'Qtd realizadas',
    '% aulas',
  ]

  const sortedStudents = [...students].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR', {
      sensitivity: 'base',
    }),
  )

  const rows = sortedStudents.map((student) => {
    const studentDone = doneByStudent.get(student.id) ?? new Set()
    const metrics = computeLessonMetricsForTrails(
      [trail.id],
      questionsByTrail,
      studentDone,
      deselectedStages,
      deselectedQuestions,
    )
    const byQuestion = groupTopicsByLesson(
      filterTrailTopicPositions(
        trail.id,
        questionsByTrail.get(trail.id) ?? [],
        deselectedStages,
        deselectedQuestions,
      ),
    )
    const lessonCells = lessonNumbers.map((n) => {
      const topics = byQuestion.get(n) ?? []
      if (topics.length === 0) return ''
      return isLessonCompleteForTrail(trail.id, topics, studentDone)
        ? 'Sim'
        : 'Não'
    })
    return [
      student.name || student.id,
      student.phone_number || '',
      ...lessonCells,
      metrics.lessonsReleased,
      metrics.lessonsDone,
      formatPctExport(metrics.lessonsCompletionPct),
    ]
  })

  const sheet = xlsx.utils.aoa_to_sheet([headers, ...rows])
  headers.forEach((header, colIndex) => {
    forceWorksheetCellString(xlsx, sheet, 0, colIndex, header)
  })
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (typeof value === 'string' && value.length > 0) {
        forceWorksheetCellString(xlsx, sheet, rowIndex + 1, colIndex, value)
      }
    })
  })
  xlsx.utils.book_append_sheet(workbook, sheet, 'Aulas')
}

export function DashboardPage() {
  const { filterInstitutions } = usePermissions()
  const [activeTab, setActiveTab] = useState<DashboardTab>('students')
  const [questionsDataEnabled, setQuestionsDataEnabled] = useState(false)
  const [isQuestionsPending, startQuestionsTransition] = useTransition()
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
  const [logAggregates, setLogAggregates] = useState<LogAggregates>(
    EMPTY_LOG_AGGREGATES,
  )
  const [stages, setStages] = useState<TrailStage[]>([])
  const [questions, setQuestions] = useState<TrailStageQuestion[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [loadStepsDone, setLoadStepsDone] = useState(0)
  const [loadStepsTotal, setLoadStepsTotal] = useState(TOTAL_LOAD_STEPS)
  const [loadPercent, setLoadPercent] = useState(0)
  const [loadLabel, setLoadLabel] = useState('')
  const [dataError, setDataError] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsRetryKey, setLogsRetryKey] = useState(0)
  const loadProgressRef = useRef({ done: 0, total: TOTAL_LOAD_STEPS })
  const loadTargetPercentRef = useRef(0)

  const computeLoadPercent = (done: number, total: number, complete = false) => {
    if (complete) return 100
    if (total <= 0) return 0
    return Math.min(99, Math.round((done / total) * 100))
  }

  const syncLoadProgress = (label: string, options?: { complete?: boolean }) => {
    const { done, total } = loadProgressRef.current
    const pct = computeLoadPercent(done, total, options?.complete)
    loadTargetPercentRef.current = pct
    setLoadStepsDone(done)
    setLoadStepsTotal(total)
    setLoadLabel(label)
    if (options?.complete) {
      setLoadPercent(100)
    }
  }

  // Filtros da tabela de alunos
  const [nameFilter, setNameFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [pctMin, setPctMin] = useState(0)
  const [pctMax, setPctMax] = useState(100)
  const [studentChartFilter, setStudentChartFilter] =
    useState<DashboardStudentChartFilter | null>(null)
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
  const [exportingPillTrailId, setExportingPillTrailId] = useState<string | null>(
    null,
  )
  const [exportError, setExportError] = useState<string | null>(null)
  const [studentSort, setStudentSort] = useState<{
    key: StudentSortKey
    dir: 'asc' | 'desc'
  }>({ key: 'name', dir: 'asc' })
  const [studentPage, setStudentPage] = useState(1)

  // Filtros do ranking de pílulas / aba Questões
  const [pillSearch, setPillSearch] = useState('')
  const [pillTrailFilter, setPillTrailFilter] = useState('')
  const [pillMinResponses, setPillMinResponses] = useState(1)
  const [pillAccMin, setPillAccMin] = useState(0)
  const [pillAccMax, setPillAccMax] = useState(100)
  const [pillPage, setPillPage] = useState(1)
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
        setLogAggregates(EMPTY_LOG_AGGREGATES)
        setDataError(null)
        setLogsError(null)
        setLoadingData(false)
        setLoadingMeta(false)
        setLoadingLogs(false)
        setLoadStepsDone(0)
        setLoadStepsTotal(TOTAL_LOAD_STEPS)
        loadProgressRef.current = { done: 0, total: TOTAL_LOAD_STEPS }
        loadTargetPercentRef.current = 0
        setLoadPercent(0)
        setLoadLabel('')
        return
      }

      loadProgressRef.current = { done: 0, total: TOTAL_LOAD_STEPS }
      loadTargetPercentRef.current = 0
      setLoadingData(true)
      // Evita frame com dashboard zerado entre o fim do loadingData e o início
      // dos efeitos de metadados/logs.
      setLoadingMeta(true)
      setLoadingLogs(true)
      setLogsError(null)
      setLoadStepsDone(0)
      setLoadStepsTotal(TOTAL_LOAD_STEPS)
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
          setStudents(snap.docs.map(snapshotToStudent))
          setDataError(null)
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

  // Stages e questões filtrados pelas trilhas da instituição (em chunks de 30
  // IDs por limitação do operador "in"), em vez de baixar as coleções inteiras.
  // Também participam do gate de loading para evitar percentuais zerados
  // enquanto ainda não chegaram.
  useEffect(() => {
    if (!db || !selectedId) {
      setStages([])
      setQuestions([])
      setLoadingMeta(false)
      return
    }
    if (loadingData) return

    const dbOk = db
    const trailIds = trailIdsKey ? trailIdsKey.split('\0') : []
    const loadedMeta = new Set<string>()

    loadProgressRef.current.done = Math.min(
      loadProgressRef.current.done,
      DATA_SOURCES,
    )

    const metaDone = (source: 'stages' | 'questions') => {
      if (loadedMeta.has(source)) return
      loadedMeta.add(source)
      loadProgressRef.current.done += 1
      syncLoadProgress('Carregando conteúdo das trilhas…')
      if (loadedMeta.size >= META_SOURCES) {
        setLoadingMeta(false)
      }
    }

    if (trailIds.length === 0) {
      setStages([])
      setQuestions([])
      metaDone('stages')
      metaDone('questions')
      return
    }

    setLoadingMeta(true)
    const chunks = chunkArray(trailIds, FIRESTORE_IN_LIMIT)
    const stageChunks = new Map<number, TrailStage[]>()
    const questionChunks = new Map<number, TrailStageQuestion[]>()
    const unsubs: (() => void)[] = []

    const flatten = <T,>(byChunk: Map<number, T[]>): T[] =>
      chunks.flatMap((_, idx) => byChunk.get(idx) ?? [])

    chunks.forEach((chunk, idx) => {
      unsubs.push(
        onSnapshot(
          query(
            collection(dbOk, TRAIL_STAGES_COLLECTION),
            where('trail_id', 'in', chunk),
          ),
          (snap) => {
            stageChunks.set(idx, snap.docs.map(snapshotToTrailStage))
            setStages(flatten(stageChunks))
            if (stageChunks.size >= chunks.length) metaDone('stages')
          },
          (err) => {
            setDataError(err.message)
            stageChunks.set(idx, [])
            setStages(flatten(stageChunks))
            if (stageChunks.size >= chunks.length) metaDone('stages')
          },
        ),
      )
      unsubs.push(
        onSnapshot(
          query(
            collection(dbOk, TRAIL_STAGE_QUESTIONS_COLLECTION),
            where('trail_id', 'in', chunk),
          ),
          (snap) => {
            questionChunks.set(idx, snap.docs.map(snapshotToTrailStageQuestion))
            setQuestions(flatten(questionChunks))
            if (questionChunks.size >= chunks.length) metaDone('questions')
          },
          (err) => {
            setDataError(err.message)
            questionChunks.set(idx, [])
            setQuestions(flatten(questionChunks))
            if (questionChunks.size >= chunks.length) metaDone('questions')
          },
        ),
      )
    })

    return () => {
      for (const u of unsubs) u()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, trailIdsKey, loadingData])

  // Métricas dos alunos: agregação server-side (/api/dashboard_summary). Se o
  // endpoint falhar, cai no caminho legado (download dos logs no browser) e,
  // se esse também falhar, mostra erro com opção de tentar novamente.
  useEffect(() => {
    let cancelled = false

    if (!db || !selectedId || loadingData) {
      return () => {
        cancelled = true
      }
    }

    const institutionId = selectedId
    const studentIds = studentIdsKey ? studentIdsKey.split('\0') : []
    if (studentIds.length === 0) {
      setLogAggregates(EMPTY_LOG_AGGREGATES)
      setLogsError(null)
      setLoadingLogs(false)
      loadProgressRef.current.done = loadProgressRef.current.total
      syncLoadProgress('', { complete: true })
      return () => {
        cancelled = true
      }
    }

    setLoadingLogs(true)
    setLogsError(null)
    loadProgressRef.current.done = Math.min(
      loadProgressRef.current.done,
      DATA_SOURCES + META_SOURCES,
    )
    syncLoadProgress('Calculando métricas dos alunos…')

    const finishProgress = () => {
      loadProgressRef.current.done = Math.min(
        loadProgressRef.current.done + 1,
        loadProgressRef.current.total,
      )
      const complete =
        loadProgressRef.current.done >= loadProgressRef.current.total
      syncLoadProgress(complete ? '' : 'Calculando métricas dos alunos…', {
        complete,
      })
    }

    async function run() {
      try {
        const summary = await fetchDashboardLogSummary(institutionId)
        if (cancelled) return
        setLogAggregates(summary)
        setLoadingLogs(false)
        finishProgress()
        return
      } catch (apiErr) {
        if (cancelled) return
        console.warn(
          'Falha na agregação server-side do dashboard; usando fallback no cliente.',
          apiErr,
        )
      }

      // Fallback legado: baixa os logs no browser e agrega localmente.
      const relevantTrailIds = new Set(
        trailIdsKey ? trailIdsKey.split('\0') : [],
      )
      const logChunks = chunkArray(studentIds, FIRESTORE_IN_LIMIT).length
      loadProgressRef.current.total =
        DATA_SOURCES + META_SOURCES + logChunks
      setLoadStepsTotal(loadProgressRef.current.total)
      syncLoadProgress('Carregando respostas dos alunos…')

      try {
        const logs = await fetchConversationLogsForStudents(
          studentIds,
          relevantTrailIds,
          (completed, total) => {
            if (cancelled) return
            loadProgressRef.current.done =
              DATA_SOURCES + META_SOURCES + completed
            loadProgressRef.current.total = DATA_SOURCES + META_SOURCES + total
            syncLoadProgress('Carregando respostas dos alunos…')
          },
        )
        if (cancelled) return
        setLogAggregates(buildLogAggregates(logs))
        setLoadingLogs(false)
        loadProgressRef.current.done = loadProgressRef.current.total
        syncLoadProgress('', { complete: true })
      } catch (err) {
        if (cancelled) return
        setLogsError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar métricas dos alunos.',
        )
        setLogAggregates(EMPTY_LOG_AGGREGATES)
        setLoadingLogs(false)
        loadTargetPercentRef.current = 0
        setLoadPercent(0)
        setLoadLabel('')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, studentIdsKey, trailIdsKey, loadingData, logsRetryKey])

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
      if (q.annulled === true) continue
      if (!(q.correct_option ?? '').trim()) count += 1
    }
    return count
  }, [questions, activeTrails, stageByKey])

  /** Questões de exercício anuladas nas trilhas ativas (visíveis no cálculo). */
  const annulledQuestionKeys = useMemo(() => {
    const activeIds = new Set(activeTrails.map((t) => t.id))
    const keys = new Set<string>()
    for (const q of questions) {
      if (!activeIds.has(q.trail_id)) continue
      if (q.annulled !== true) continue
      const stage = stageByKey.get(`${q.trail_id}|${q.stage_number}`)
      if (stage?.stage_type !== 'exercise') continue
      keys.add(`${q.trail_id}|${q.stage_number}|${q.question_number}`)
    }
    return keys
  }, [questions, activeTrails, stageByKey])

  const annulledGabaritoCount = annulledQuestionKeys.size

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

  const doneQuestionsByStudent = logAggregates.doneByStudent
  const studentAnswerMap = logAggregates.answerMap

  /**
   * Quantas respostas de alunos estão em questão anulada e saem do
   * denominador de acerto/erro.
   */
  const annulledAnswersExcluded = useMemo(() => {
    if (annulledQuestionKeys.size === 0) return 0
    let count = 0
    for (const [answerKey, answer] of studentAnswerMap) {
      if (!answer.trim()) continue
      const first = answerKey.indexOf('|')
      if (first < 0) continue
      const qKey = answerKey.slice(first + 1)
      if (annulledQuestionKeys.has(qKey)) count += 1
    }
    return count
  }, [studentAnswerMap, annulledQuestionKeys])

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

      const lessonMetrics = computeLessonMetricsForTrails(
        enrolled.map((st) => st.trail_id),
        questionsByTrail,
        studentDone,
        deselectedStages,
        deselectedQuestions,
      )

      const agg = attemptsByStudent.get(student.id) ?? { correct: 0, wrong: 0 }
      return {
        student,
        released,
        done,
        completionPct: pct(done, released),
        lessonsReleased: lessonMetrics.lessonsReleased,
        lessonsDone: lessonMetrics.lessonsDone,
        lessonsCompletionPct: lessonMetrics.lessonsCompletionPct,
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
    const query = nameFilter.trim().toLowerCase()
    const queryDigits = query.replace(/\D/g, '')
    const lo = Math.min(pctMin, pctMax)
    const hi = Math.max(pctMin, pctMax)
    return studentRows.filter((row) => {
      if (query) {
        const nameMatch = row.student.name.toLowerCase().includes(query)
        const phone = (row.student.phone_number ?? '').toLowerCase()
        const phoneDigits = phone.replace(/\D/g, '')
        const phoneMatch =
          phone.includes(query) ||
          (queryDigits.length > 0 && phoneDigits.includes(queryDigits))
        if (!nameMatch && !phoneMatch) return false
      }
      const p = row.completionPct ?? 0
      if (p < lo || p > hi) return false
      return true
    })
  }, [studentRows, nameFilter, pctMin, pctMax])

  const chartFilteredStudentRows = useMemo(() => {
    if (!studentChartFilter) return filteredStudentRows
    return filteredStudentRows.filter((row) => {
      if (studentChartFilter.kind === 'status') {
        return getStudentEngagementStatus(row) === studentChartFilter.key
      }
      return (
        getCompletionBucketKey(row.completionPct) === studentChartFilter.key
      )
    })
  }, [filteredStudentRows, studentChartFilter])

  const sortedFilteredStudentRows = useMemo(() => {
    const rows = [...chartFilteredStudentRows]
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
        case 'lessonsReleased':
          cmp = a.lessonsReleased - b.lessonsReleased
          break
        case 'lessonsDone':
          cmp = a.lessonsDone - b.lessonsDone
          break
        case 'lessonsCompletionPct':
          cmp = compareNullableNumber(a.lessonsCompletionPct, b.lessonsCompletionPct)
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
  }, [chartFilteredStudentRows, studentSort])

  const studentPageCount = useMemo(
    () =>
      Math.max(1, Math.ceil(sortedFilteredStudentRows.length / STUDENTS_PAGE_SIZE)),
    [sortedFilteredStudentRows.length],
  )

  const paginatedStudentRows = useMemo(() => {
    const start = (studentPage - 1) * STUDENTS_PAGE_SIZE
    return sortedFilteredStudentRows.slice(start, start + STUDENTS_PAGE_SIZE)
  }, [sortedFilteredStudentRows, studentPage])

  useEffect(() => {
    setStudentPage(1)
  }, [
    selectedId,
    nameFilter,
    pctMin,
    pctMax,
    subjectFilter,
    studentChartFilter,
  ])

  useEffect(() => {
    if (studentPage > studentPageCount) {
      setStudentPage(studentPageCount)
    }
  }, [studentPage, studentPageCount])

  const studentPageRange = useMemo(() => {
    if (sortedFilteredStudentRows.length === 0) {
      return { start: 0, end: 0 }
    }
    const start = (studentPage - 1) * STUDENTS_PAGE_SIZE + 1
    const end = Math.min(
      studentPage * STUDENTS_PAGE_SIZE,
      sortedFilteredStudentRows.length,
    )
    return { start, end }
  }, [sortedFilteredStudentRows.length, studentPage])

  // Cards de resumo — refletem os filtros da tabela de alunos
  // (busca, matéria e faixa de % conclusão).
  const summary = useMemo(() => {
    const activeRows = filteredStudentRows.filter((r) => r.student.active)
    const completionVals = activeRows
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
    for (const row of activeRows) {
      correct += row.correct
      total += row.correct + row.wrong
    }

    return {
      activeStudents: activeRows.length,
      activeTrails: activeTrails.length,
      avgCompletion,
      avgAccuracy: pct(correct, total),
    }
  }, [filteredStudentRows, activeTrails])

  const studentsCharts = useMemo(() => {
    const completionBuckets = [
      { key: '0-20', label: '0–20%', count: 0 },
      { key: '21-40', label: '21–40%', count: 0 },
      { key: '41-60', label: '41–60%', count: 0 },
      { key: '61-80', label: '61–80%', count: 0 },
      { key: '81-100', label: '81–100%', count: 0 },
    ]
    const statusCounts = {
      notStarted: 0,
      inProgress: 0,
      completed: 0,
    }

    for (const row of filteredStudentRows) {
      const completion = row.completionPct
      statusCounts[getStudentEngagementStatus(row)] += 1

      if (completion !== null) {
        if (completion <= 20) completionBuckets[0].count += 1
        else if (completion <= 40) completionBuckets[1].count += 1
        else if (completion <= 60) completionBuckets[2].count += 1
        else if (completion <= 80) completionBuckets[3].count += 1
        else completionBuckets[4].count += 1
      }

    }

    return {
      studentCount: filteredStudentRows.length,
      completionBuckets,
      statuses: [
        {
          key: 'notStarted' as const,
          label: 'Não iniciou',
          count: statusCounts.notStarted,
        },
        {
          key: 'inProgress' as const,
          label: 'Em andamento',
          count: statusCounts.inProgress,
        },
        {
          key: 'completed' as const,
          label: 'Concluiu (100%)',
          count: statusCounts.completed,
        },
      ],
    }
  }, [filteredStudentRows])

  // Ranking de pílulas — itera só respostas existentes no mapa
  const gradablePillQuestions = useMemo(() => {
    const map = new Map<string, string>()
    if (!questionsDataEnabled) return map

    for (const trail of activeTrails) {
      const positions = questionsByTrail.get(trail.id) ?? []
      for (const p of positions) {
        const stage = stageByKey.get(`${trail.id}|${p.stage}`)
        if (stage?.stage_type !== 'exercise') continue

        const key = `${trail.id}|${p.stage}|${p.question}`
        const question = questionByKey.get(key)
        if (question?.annulled === true) continue
        const gabarito = (question?.correct_option ?? '').trim()
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
    questionsDataEnabled,
  ])

  const pillRows = useMemo<PillRow[]>(() => {
    if (!questionsDataEnabled) return []

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
      if (total < 1) continue
      rows.push({
        key,
        trailId,
        trailName: trail?.name || trailId,
        subject: trail?.subject?.trim() || '—',
        stageNumber,
        questionNumber,
        title: question?.title || '—',
        content: question?.content ?? '',
        gabarito: formatGabaritoLetter(
          gradablePillQuestions.get(key) ??
            question?.correct_option ??
            '',
        ),
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
    questionsDataEnabled,
  ])

  const filteredPillRows = useMemo(() => {
    const query = pillSearch.trim().toLowerCase()
    const lo = Math.min(pillAccMin, pillAccMax)
    const hi = Math.max(pillAccMin, pillAccMax)
    return pillRows.filter((row) => {
      if (row.total < pillMinResponses) return false
      if (pillTrailFilter && row.trailId !== pillTrailFilter) return false
      if (row.accuracyPct < lo || row.accuracyPct > hi) return false
      if (query) {
        const code = `t${row.stageNumber} a${row.questionNumber}`
        const haystack = [
          row.title,
          row.content,
          row.trailName,
          row.subject,
          row.gabarito,
          code,
          `t${row.stageNumber}`,
          `a${row.questionNumber}`,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [
    pillRows,
    pillSearch,
    pillTrailFilter,
    pillMinResponses,
    pillAccMin,
    pillAccMax,
  ])

  const sortedPillRows = useMemo(() => {
    const rows = [...filteredPillRows]
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
  }, [filteredPillRows, pillSort])

  const worstPills = useMemo(
    () =>
      [...filteredPillRows]
        .sort((a, b) => a.accuracyPct - b.accuracyPct)
        .slice(0, 5),
    [filteredPillRows],
  )
  const bestPills = useMemo(
    () =>
      [...filteredPillRows]
        .sort((a, b) => b.accuracyPct - a.accuracyPct)
        .slice(0, 5),
    [filteredPillRows],
  )

  const questionsCharts = useMemo(() => {
    let correctTotal = 0
    let wrongTotal = 0
    const filteredQuestionKeys = new Set(
      filteredPillRows.map((row) => row.key),
    )
    const studentIds = new Set<string>()
    const buckets = [
      { label: '0–20%', count: 0 },
      { label: '21–40%', count: 0 },
      { label: '41–60%', count: 0 },
      { label: '61–80%', count: 0 },
      { label: '81–100%', count: 0 },
    ]
    const byTrail = new Map<
      string,
      { label: string; responses: number; weightedAcc: number }
    >()

    for (const row of filteredPillRows) {
      correctTotal += row.correct
      wrongTotal += row.wrong
      if (row.accuracyPct <= 20) buckets[0].count += 1
      else if (row.accuracyPct <= 40) buckets[1].count += 1
      else if (row.accuracyPct <= 60) buckets[2].count += 1
      else if (row.accuracyPct <= 80) buckets[3].count += 1
      else buckets[4].count += 1

      const trail = byTrail.get(row.trailId)
      if (trail) {
        trail.responses += row.total
        trail.weightedAcc += row.accuracyPct * row.total
      } else {
        byTrail.set(row.trailId, {
          label: row.trailName,
          responses: row.total,
          weightedAcc: row.accuracyPct * row.total,
        })
      }
    }

    for (const [answerKey, answer] of studentAnswerMap) {
      if (!answer.trim()) continue
      const parts = answerKey.split('|')
      if (parts.length !== 4) continue
      const studentId = parts[0]
      const questionKey = `${parts[1]}|${parts[2]}|${parts[3]}`
      if (filteredQuestionKeys.has(questionKey)) studentIds.add(studentId)
    }

    const responseCount = correctTotal + wrongTotal
    const trailBars = [...byTrail.entries()]
      .map(([id, t]) => ({
        id,
        label: t.label,
        responses: t.responses,
        avgAccuracy:
          t.responses > 0 ? Math.round(t.weightedAcc / t.responses) : 0,
      }))
      .sort((a, b) => b.responses - a.responses)
      .slice(0, 8)

    return {
      studentCount: studentIds.size,
      questionCount: filteredPillRows.length,
      responseCount,
      avgAccuracy: pct(correctTotal, responseCount),
      correctTotal,
      wrongTotal,
      accuracyBuckets: buckets,
      trailBars,
    }
  }, [filteredPillRows, studentAnswerMap])

  const pillPageCount = useMemo(
    () => Math.max(1, Math.ceil(sortedPillRows.length / PILLS_PAGE_SIZE)),
    [sortedPillRows.length],
  )

  const paginatedPillRows = useMemo(() => {
    const start = (pillPage - 1) * PILLS_PAGE_SIZE
    return sortedPillRows.slice(start, start + PILLS_PAGE_SIZE)
  }, [sortedPillRows, pillPage])

  const pillPageRange = useMemo(() => {
    if (sortedPillRows.length === 0) return { start: 0, end: 0 }
    const start = (pillPage - 1) * PILLS_PAGE_SIZE + 1
    const end = Math.min(pillPage * PILLS_PAGE_SIZE, sortedPillRows.length)
    return { start, end }
  }, [sortedPillRows.length, pillPage])

  useEffect(() => {
    setPillPage(1)
  }, [
    selectedId,
    pillSearch,
    pillTrailFilter,
    pillMinResponses,
    pillAccMin,
    pillAccMax,
  ])

  useEffect(() => {
    if (pillPage > pillPageCount) setPillPage(pillPageCount)
  }, [pillPage, pillPageCount])

  const pillExportTrails = useMemo(() => {
    if (!pillTrailFilter) return activeTrails
    return activeTrails.filter((t) => t.id === pillTrailFilter)
  }, [activeTrails, pillTrailFilter])

  const pillTrailOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of pillRows) {
      byId.set(row.trailId, row.trailName)
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }),
      )
  }, [pillRows])

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

  async function exportTrailHistoryXlsx(trailId: string) {
    const trail = trailById.get(trailId)
    if (!db || !trail || exportingTrailId) return
    setExportError(null)
    setExportingTrailId(trail.id)
    try {
      const xlsx = await loadXlsx()

      // Dá tempo para o navegador renderizar o estado "Gerando…" antes do
      // processamento síncrono do XLSX bloquear a thread principal.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve())
        })
      })

      // Reutiliza os agregados já carregados no dashboard (mesmos alunos e
      // trilhas da instituição), sem refazer o download de logs.
      const answersByKey = studentAnswerMap
      const exportDoneByStudent = doneQuestionsByStudent

      const answerColumns = (
        allQuestionColumnsByTrail.get(trail.id) ?? []
      ).filter(
        (p) =>
          !deselectedStages.has(`${trail.id}|${p.stage}`) &&
          !deselectedQuestions.has(p.question),
      )
      const fixedHeaders = [
        'Nome',
        'Telefone',
        'Tópicos liberados',
        'Tópicos feitos',
        '% conclusão',
      ]
      const headers = [
        ...fixedHeaders,
        ...answerColumns.map((p) =>
          lessonTopicColumnLabel(trail.id, p.stage, p.question, stageByKey),
        ),
      ]

      // Exporta todas as linhas que correspondem aos filtros atuais, não
      // apenas os 20 alunos da página visível.
      const sortedStudents = sortedFilteredStudentRows.map((row) => row.student)

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
          const answerKey = `${student.id}|${trail.id}|${p.stage}|${p.question}`
          row.push(answersByKey.get(answerKey) ?? '')
        }
        return row
      })

      const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows])
      const fixedColCount = fixedHeaders.length

      headers.forEach((header, colIndex) => {
        forceWorksheetCellString(xlsx, worksheet, 0, colIndex, header)
      })

      rows.forEach((row, rowIndex) => {
        for (let colIndex = fixedColCount; colIndex < headers.length; colIndex++) {
          const value = row[colIndex]
          if (typeof value === 'string' && value.length > 0) {
            forceWorksheetCellString(xlsx, worksheet, rowIndex + 1, colIndex, value)
          }
        }
      })

      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Histórico')
      appendCorrespondenceSheet(
        xlsx,
        workbook,
        trail.id,
        answerColumns,
        stageByKey,
        questionByKey,
      )
      appendLessonsProgressSheet(
        xlsx,
        workbook,
        trail,
        sortedStudents,
        questionsByTrail,
        exportDoneByStudent,
        deselectedStages,
        deselectedQuestions,
      )
      const trailSlug = slugFileName(trail.name || trail.id)
      xlsx.writeFile(workbook, `historico-alunos-${trailSlug}.xlsx`)
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao gerar planilha.',
      )
    } finally {
      setExportingTrailId(null)
    }
  }

  async function exportPillTrailXlsx(trailId: string) {
    const trail = trailById.get(trailId)
    if (!trail || exportingPillTrailId) return
    setExportError(null)
    setExportingPillTrailId(trail.id)
    try {
      const xlsx = await loadXlsx()
      const rows = sortedPillRows.filter((p) => p.trailId === trail.id)
      const headers = [
        'Trilha',
        'Matéria',
        'Tópico / Aula',
        'Título',
        'Enunciado',
        'Gabarito',
        'Respostas',
        'Acertos',
        'Erros',
        '% acerto',
      ]
      const data = rows.map((p) => [
        p.trailName,
        p.subject,
        lessonTopicColumnLabel(
          p.trailId,
          p.stageNumber,
          p.questionNumber,
          stageByKey,
        ),
        p.title,
        p.content.trim() || p.title.trim(),
        p.gabarito,
        p.total,
        p.correct,
        p.wrong,
        `${p.accuracyPct}%`,
      ])

      const worksheet = xlsx.utils.aoa_to_sheet([headers, ...data])
      headers.forEach((header, colIndex) => {
        forceWorksheetCellString(xlsx, worksheet, 0, colIndex, header)
      })
      data.forEach((row, rowIndex) => {
        const enunciado = row[4]
        if (typeof enunciado === 'string' && enunciado.length > 0) {
          forceWorksheetCellString(xlsx, worksheet, rowIndex + 1, 4, enunciado)
        }
        const gabarito = row[5]
        if (typeof gabarito === 'string' && gabarito.length > 0) {
          forceWorksheetCellString(xlsx, worksheet, rowIndex + 1, 5, gabarito)
        }
      })

      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Aulas')
      const correspondencePositions =
        allQuestionColumnsByTrail.get(trail.id) ?? []
      if (correspondencePositions.length > 0) {
        appendCorrespondenceSheet(
          xlsx,
          workbook,
          trail.id,
          correspondencePositions,
          stageByKey,
          questionByKey,
        )
      }
      const trailSlug = slugFileName(trail.name || trail.id)
      xlsx.writeFile(workbook, `aulas-acertos-erros-${trailSlug}.xlsx`)
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao gerar planilha.',
      )
    } finally {
      setExportingPillTrailId(null)
    }
  }

  const visibleColumns = ALL_STUDENT_COLUMNS.filter(
    (c) => !hiddenColumns.has(c.key),
  )

  const hasActiveStudentExportFilters =
    nameFilter.trim().length > 0 ||
    subjectFilter.length > 0 ||
    studentChartFilter !== null ||
    pctMin !== 0 ||
    pctMax !== 100 ||
    selectedQuestionCount < availableQuestions.length ||
    selectedStageCount < availableStages.length

  const isDashboardLoading =
    Boolean(selectedId) && (loadingData || loadingMeta || loadingLogs)

  useEffect(() => {
    if (isDashboardLoading) return
    loadTargetPercentRef.current = 0
  }, [isDashboardLoading])

  useEffect(() => {
    if (!isDashboardLoading) return

    const id = window.setInterval(() => {
      const target = loadTargetPercentRef.current
      setLoadPercent((current) => {
        if (current === target) return current
        if (current < target) return Math.min(current + 1, target)
        return Math.max(current - 1, target)
      })
    }, 40)

    return () => window.clearInterval(id)
  }, [isDashboardLoading, loadStepsDone, loadStepsTotal])

  const institutionOptions = sortedInstitutions.map((inst) => ({
    id: inst.id,
    label: inst.name || inst.id,
  }))

  const questionPickerItems = availableQuestions.map((n) => ({
    id: String(n),
    label: `Aula ${n}`,
  }))
  const questionPickerSelectedIds = availableQuestions
    .filter((n) => !deselectedQuestions.has(n))
    .map(String)
  const questionPickerLabel =
    availableQuestions.length > 0
      ? ` (${selectedQuestionCount}/${availableQuestions.length})`
      : ''

  const stagePickerItems = availableStages.map((s) => ({
    id: s.key,
    label: `${s.trailName} · Tópico ${s.stageNumber}${
      s.title ? ` — ${s.title}` : ''
    } (${s.stageType})`,
  }))
  const stagePickerSelectedIds = availableStages
    .map((s) => s.key)
    .filter((k) => !deselectedStages.has(k))
  const stagePickerLabel =
    availableStages.length > 0
      ? ` (${selectedStageCount}/${availableStages.length})`
      : ''

  const columnPickerItems = ALL_STUDENT_COLUMNS.map((c) => ({
    id: c.key,
    label: c.label,
  }))
  const columnPickerSelectedIds = ALL_STUDENT_COLUMNS.map((c) => c.key).filter(
    (k) => !hiddenColumns.has(k),
  )

  const studentExportTrails = relevantTrails.map((trail) => ({
    id: trail.id,
    label: trail.name || trail.id,
  }))

  const pillExportTrailOptions = pillExportTrails.map((trail) => ({
    id: trail.id,
    label: trail.name || trail.id,
  }))

  const toPillView = (p: PillRow): DashboardPillRowView => ({
    ...p,
    trailHref: trailPath(p.trailId),
  })

  const paginatedStudentRowsView = paginatedStudentRows.map((row) => ({
    id: row.student.id,
    name: row.student.name,
    href: studentPath(row.student.id),
    phone: row.student.phone_number || '',
    released: row.released,
    done: row.done,
    completionPct: row.completionPct,
    lessonsReleased: row.lessonsReleased,
    lessonsDone: row.lessonsDone,
    lessonsCompletionPct: row.lessonsCompletionPct,
    correct: row.correct,
    wrong: row.wrong,
    accuracyPct: row.accuracyPct,
  }))

  const visibleColumnsView = visibleColumns.map((c) => ({
    key: c.key,
    label: c.label,
    sortIndicator: studentSortIndicator(c.key),
  }))

  return (
    <DashboardPageView
      loadingInst={loadingInst}
      institutionOptions={institutionOptions}
      selectedId={selectedId}
      onSelectInstitution={(id) => {
        setSelectedId(id)
        setStudentChartFilter(null)
        setActiveTab('students')
        setQuestionsDataEnabled(false)
        setPillSearch('')
        setPillTrailFilter('')
        setPillMinResponses(1)
        setPillAccMin(0)
        setPillAccMax(100)
        setPillPage(1)
      }}
      activeTab={activeTab}
      onActiveTabChange={(tab) => {
        setActiveTab(tab)
        if (tab === 'questions' && !questionsDataEnabled) {
          startQuestionsTransition(() => {
            setQuestionsDataEnabled(true)
          })
        }
      }}
      isQuestionsTabLoading={
        activeTab === 'questions' &&
        (!questionsDataEnabled || isQuestionsPending)
      }
      instError={instError}
      dataError={dataError}
      exportError={exportError}
      isDashboardLoading={isDashboardLoading}
      loadLabel={loadLabel}
      loadPercent={loadPercent}
      logsError={logsError}
      onRetryLogs={() => setLogsRetryKey((k) => k + 1)}
      summary={summary}
      missingGabaritoCount={missingGabaritoCount}
      annulledGabaritoCount={annulledGabaritoCount}
      annulledAnswersExcluded={annulledAnswersExcluded}
      filteredStudentCount={chartFilteredStudentRows.length}
      totalStudentCount={studentRows.length}
      questionPickerLabel={questionPickerLabel}
      showQuestionPicker={showQuestionPicker}
      onToggleQuestionPicker={() => {
        setShowQuestionPicker((v) => !v)
        setShowStagePicker(false)
        setShowColumnPicker(false)
      }}
      questionPickerItems={questionPickerItems}
      questionPickerSelectedIds={questionPickerSelectedIds}
      onApplyQuestionPicker={(next) => {
        setDeselectedQuestions(
          new Set(availableQuestions.filter((n) => !next.has(String(n)))),
        )
        setShowQuestionPicker(false)
      }}
      onCloseQuestionPicker={() => setShowQuestionPicker(false)}
      stagePickerLabel={stagePickerLabel}
      showStagePicker={showStagePicker}
      onToggleStagePicker={() => {
        setShowStagePicker((v) => !v)
        setShowQuestionPicker(false)
        setShowColumnPicker(false)
      }}
      stagePickerItems={stagePickerItems}
      stagePickerSelectedIds={stagePickerSelectedIds}
      onApplyStagePicker={(next) => {
        setDeselectedStages(
          new Set(
            availableStages.map((s) => s.key).filter((k) => !next.has(k)),
          ),
        )
        setShowStagePicker(false)
      }}
      onCloseStagePicker={() => setShowStagePicker(false)}
      showColumnPicker={showColumnPicker}
      onToggleColumnPicker={() => {
        setShowColumnPicker((v) => !v)
        setShowStagePicker(false)
        setShowQuestionPicker(false)
      }}
      columnPickerItems={columnPickerItems}
      columnPickerSelectedIds={columnPickerSelectedIds}
      onApplyColumnPicker={(next) => {
        setHiddenColumns(
          new Set(
            ALL_STUDENT_COLUMNS.map((c) => c.key).filter((k) => !next.has(k)),
          ),
        )
        setShowColumnPicker(false)
      }}
      onCloseColumnPicker={() => setShowColumnPicker(false)}
      studentExportTrails={studentExportTrails}
      exportingTrailId={exportingTrailId}
      onExportTrailHistory={(trailId) => {
        void exportTrailHistoryXlsx(trailId)
      }}
      hasActiveStudentExportFilters={hasActiveStudentExportFilters}
      nameFilter={nameFilter}
      onNameFilterChange={setNameFilter}
      subjectFilter={subjectFilter}
      onSubjectFilterChange={setSubjectFilter}
      subjects={subjects}
      pctMin={pctMin}
      pctMax={pctMax}
      onPctMinChange={setPctMin}
      onPctMaxChange={setPctMax}
      nameSortIndicator={studentSortIndicator('name')}
      onToggleStudentSort={toggleStudentSort}
      visibleColumns={visibleColumnsView}
      studentRowsEmpty={studentRows.length === 0}
      paginatedStudentRows={paginatedStudentRowsView}
      showStudentPagination={
        sortedFilteredStudentRows.length > STUDENTS_PAGE_SIZE
      }
      studentPageRange={studentPageRange}
      sortedFilteredStudentCount={sortedFilteredStudentRows.length}
      studentPage={studentPage}
      studentPageCount={studentPageCount}
      onStudentPagePrev={() => setStudentPage((p) => Math.max(1, p - 1))}
      onStudentPageNext={() =>
        setStudentPage((p) => Math.min(studentPageCount, p + 1))
      }
      studentsCharts={studentsCharts}
      studentChartFilter={studentChartFilter}
      onStudentChartFilterChange={setStudentChartFilter}
      sortedPillCount={sortedPillRows.length}
      totalPillCount={pillRows.length}
      pillExportTrails={pillExportTrailOptions}
      exportingPillTrailId={exportingPillTrailId}
      onExportPillTrail={(trailId) => {
        void exportPillTrailXlsx(trailId)
      }}
      pillSearch={pillSearch}
      onPillSearchChange={setPillSearch}
      pillTrailFilter={pillTrailFilter}
      onPillTrailFilterChange={setPillTrailFilter}
      pillTrailOptions={pillTrailOptions}
      pillMinResponses={pillMinResponses}
      onPillMinResponsesChange={setPillMinResponses}
      pillAccMin={pillAccMin}
      pillAccMax={pillAccMax}
      onPillAccMinChange={setPillAccMin}
      onPillAccMaxChange={setPillAccMax}
      questionsCharts={questionsCharts}
      worstPills={worstPills.map(toPillView)}
      bestPills={bestPills.map(toPillView)}
      onTogglePillSort={togglePillSort}
      pillSortIndicator={pillSortIndicator}
      paginatedPillRows={paginatedPillRows.map(toPillView)}
      showPillPagination={sortedPillRows.length > PILLS_PAGE_SIZE}
      pillPageRange={pillPageRange}
      pillPage={pillPage}
      pillPageCount={pillPageCount}
      onPillPagePrev={() => setPillPage((p) => Math.max(1, p - 1))}
      onPillPageNext={() =>
        setPillPage((p) => Math.min(pillPageCount, p + 1))
      }
    />
  )
}
