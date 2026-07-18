import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import type * as XLSX from 'xlsx'
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
import { fetchDashboardLogSummary } from '../lib/dashboardSummaryApi'
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
const ENUNCIADO_PREVIEW_MAX = 100

type ExpandedEnunciado = {
  topicLabel: string
  title: string
  trailName: string
  text: string
}

const ALL_STUDENT_COLUMNS = [
  { key: 'phone', label: 'Telefone' },
  { key: 'released', label: 'Tópicos liberados' },
  { key: 'done', label: 'Tópicos feitos' },
  { key: 'completionPct', label: '% conclusão (tópicos)' },
  { key: 'lessonsReleased', label: 'Aulas liberadas' },
  { key: 'lessonsDone', label: 'Aulas realizadas' },
  { key: 'lessonsCompletionPct', label: '% conclusão (aulas)' },
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
  lessonsReleased: number
  lessonsDone: number
  lessonsCompletionPct: number | null
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

/** Código legível na UI do dashboard, ex.: T3 A1. */
function formatLessonTopicCode(topicNumber: number, lessonNumber: number): string {
  return `T${topicNumber} A${lessonNumber}`
}

function truncateEnunciadoPreview(text: string, max = ENUNCIADO_PREVIEW_MAX): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max).trimEnd()}…`
}

function EnunciadoPreviewCell({
  content,
  title,
  onExpand,
}: {
  content: string
  title: string
  onExpand: () => void
}) {
  const fullText = content.trim() || title.trim()
  if (!fullText) {
    return <span className="muted">—</span>
  }
  const preview = truncateEnunciadoPreview(fullText)
  const isTruncated = preview.endsWith('…')

  return (
    <button
      type="button"
      className="table__text-btn dashboard-enunciado-preview"
      onClick={onExpand}
      title={isTruncated ? 'Clique para ver o enunciado completo' : fullText}
    >
      {preview}
    </button>
  )
}

function LessonTopicCode({
  topicNumber,
  lessonNumber,
  content,
  title,
}: {
  topicNumber: number
  lessonNumber: number
  content: string
  title?: string
}) {
  const label = formatLessonTopicCode(topicNumber, lessonNumber)
  const enunciado = content.trim() || title?.trim() || ''
  if (!enunciado) {
    return <code>{label}</code>
  }
  return (
    <span className="dashboard-lesson-topic-tip">
      <code className="dashboard-lesson-topic-tip__code">{label}</code>
      <span className="dashboard-lesson-topic-tip__popup" role="tooltip">
        {enunciado}
      </span>
    </span>
  )
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

// A biblioteca xlsx (~424 kB) só é necessária ao exportar planilhas; o import
// dinâmico a mantém fora do bundle inicial sem alterar o resultado gerado.
type XlsxModule = typeof import('xlsx')

let xlsxModulePromise: Promise<XlsxModule> | null = null

function loadXlsx(): Promise<XlsxModule> {
  xlsxModulePromise ??= import('xlsx')
  return xlsxModulePromise
}

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

type ExcelPickerItem = { id: string; label: string }

/**
 * Popover estilo AutoFiltro do Excel: busca, "(Selecionar tudo)" com estado
 * intermediário, lista rolável de checkboxes e OK/Cancelar. As mudanças só
 * são aplicadas ao clicar em OK; fechar (Cancelar, Esc ou clique fora)
 * descarta o rascunho.
 */
function ExcelFilterPopover({
  hint,
  items,
  selectedIds,
  emptyMessage,
  onApply,
  onClose,
}: {
  hint?: string
  items: ExcelPickerItem[]
  selectedIds: Set<string>
  emptyMessage: string
  onApply: (next: Set<string>) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds))
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.label.toLowerCase().includes(q))
  }, [items, search])

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((it) => draft.has(it.id))
  const someFilteredSelected = filteredItems.some((it) => draft.has(it.id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someFilteredSelected && !allFilteredSelected
    }
  }, [someFilteredSelected, allFilteredSelected])

  useEffect(() => {
    // Enquanto o OK está aplicando, ignora Esc/clique fora para o popover
    // não sumir antes do feedback de conclusão.
    if (isPending) return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current
      if (!root) return
      // O wrapper inclui o botão que abre o popover; clique nele não conta
      // como "fora" (o próprio onClick do botão faz o toggle).
      const wrapper = root.parentElement ?? root
      if (e.target instanceof Node && !wrapper.contains(e.target)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, isPending])

  function toggleItem(id: string) {
    setDraft((curr) => {
      const next = new Set(curr)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setDraft((curr) => {
      const next = new Set(curr)
      if (allFilteredSelected) {
        for (const it of filteredItems) next.delete(it.id)
      } else {
        for (const it of filteredItems) next.add(it.id)
      }
      return next
    })
  }

  return (
    <div
      ref={rootRef}
      className={`excel-picker__popover${
        isPending ? ' excel-picker__popover--pending' : ''
      }`}
      role="dialog"
      aria-busy={isPending}
    >
      {hint ? <span className="muted excel-picker__hint">{hint}</span> : null}
      <input
        type="search"
        className="excel-picker__search"
        placeholder="Pesquisar…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="excel-picker__list">
        {items.length === 0 ? (
          <span className="muted">{emptyMessage}</span>
        ) : (
          <>
            <label className="field field--inline excel-picker__select-all">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                disabled={filteredItems.length === 0}
              />
              <span>(Selecionar tudo)</span>
            </label>
            {filteredItems.length === 0 ? (
              <span className="muted">Nenhum item encontrado.</span>
            ) : (
              filteredItems.map((it) => (
                <label key={it.id} className="field field--inline">
                  <input
                    type="checkbox"
                    checked={draft.has(it.id)}
                    onChange={() => toggleItem(it.id)}
                  />
                  <span>{it.label}</span>
                </label>
              ))
            )}
          </>
        )}
      </div>
      <div className="excel-picker__footer">
        <button
          type="button"
          className="btn btn--small excel-picker__ok"
          disabled={isPending}
          onClick={() => {
            // O fechamento do popover acontece dentro do onApply do pai;
            // como está na transição, só ocorre quando o recálculo termina.
            startTransition(() => {
              onApply(draft)
            })
          }}
        >
          {isPending ? (
            <>
              <span className="excel-picker__spinner" aria-hidden="true" />
              Aplicando…
            </>
          ) : (
            'OK'
          )}
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={isPending}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
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

  // Filtros do ranking de pílulas
  const [pillSubjectFilter, setPillSubjectFilter] = useState('')
  const [pillMinResponses, setPillMinResponses] = useState(1)
  const [pillSort, setPillSort] = useState<{
    key: PillSortKey
    dir: 'asc' | 'desc'
  }>({ key: 'accuracyPct', dir: 'asc' })
  const [expandedEnunciado, setExpandedEnunciado] =
    useState<ExpandedEnunciado | null>(null)

  useEffect(() => {
    if (!expandedEnunciado) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedEnunciado(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedEnunciado])

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
  }, [filteredStudentRows, studentSort])

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
  }, [selectedId, nameFilter, pctMin, pctMax, subjectFilter])

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

  const pillExportTrails = useMemo(() => {
    if (!pillSubjectFilter) return activeTrails
    return activeTrails.filter((t) => t.subject?.trim() === pillSubjectFilter)
  }, [activeTrails, pillSubjectFilter])

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

  async function exportTrailHistoryXlsx(trail: Trail) {
    if (!db || exportingTrailId) return
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

  async function exportPillTrailXlsx(trail: Trail) {
    if (exportingPillTrailId) return
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

  return (
    <>
      <header className="admin__header">
        <h1>Dashboard</h1>
        {!isDashboardLoading ? (
          <p className="admin__lede muted">
            Visão geral de engajamento dos alunos e desempenho por aula
            (exercício).
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
      ) : logsError ? (
        <section className="panel">
          <p className="banner banner--error" role="alert">
            Não foi possível carregar as métricas dos alunos: {logsError}
          </p>
          <p className="muted">
            Os totais de alunos e trilhas foram carregados, mas os percentuais
            de conclusão e acerto ficariam zerados. Tente novamente.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setLogsRetryKey((k) => k + 1)}
          >
            Tentar novamente
          </button>
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
                  Aulas sem gabarito
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
                <span className="excel-picker">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                      setShowQuestionPicker((v) => !v)
                      setShowStagePicker(false)
                      setShowColumnPicker(false)
                    }}
                  >
                    Aulas
                    {availableQuestions.length > 0
                      ? ` (${selectedQuestionCount}/${availableQuestions.length})`
                      : ''}
                  </button>
                  {showQuestionPicker ? (
                    <ExcelFilterPopover
                      hint="Aulas incluídas no cálculo (por número no tópico da aula: A1, A2…)."
                      items={availableQuestions.map((n) => ({
                        id: String(n),
                        label: `Aula ${n}`,
                      }))}
                      selectedIds={
                        new Set(
                          availableQuestions
                            .filter((n) => !deselectedQuestions.has(n))
                            .map(String),
                        )
                      }
                      emptyMessage="Nenhuma aula nas trilhas atuais."
                      onApply={(next) => {
                        setDeselectedQuestions(
                          new Set(
                            availableQuestions.filter(
                              (n) => !next.has(String(n)),
                            ),
                          ),
                        )
                        setShowQuestionPicker(false)
                      }}
                      onClose={() => setShowQuestionPicker(false)}
                    />
                  ) : null}
                </span>
                <span className="excel-picker">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                      setShowStagePicker((v) => !v)
                      setShowQuestionPicker(false)
                      setShowColumnPicker(false)
                    }}
                  >
                    Tópicos
                    {availableStages.length > 0
                      ? ` (${selectedStageCount}/${availableStages.length})`
                      : ''}
                  </button>
                  {showStagePicker ? (
                    <ExcelFilterPopover
                      hint="Tópicos da aula incluídos no cálculo de aulas liberadas/feitas."
                      items={availableStages.map((s) => ({
                        id: s.key,
                        label: `${s.trailName} · Tópico ${s.stageNumber}${
                          s.title ? ` — ${s.title}` : ''
                        } (${s.stageType})`,
                      }))}
                      selectedIds={
                        new Set(
                          availableStages
                            .map((s) => s.key)
                            .filter((k) => !deselectedStages.has(k)),
                        )
                      }
                      emptyMessage="Nenhum tópico da aula nas trilhas atuais."
                      onApply={(next) => {
                        setDeselectedStages(
                          new Set(
                            availableStages
                              .map((s) => s.key)
                              .filter((k) => !next.has(k)),
                          ),
                        )
                        setShowStagePicker(false)
                      }}
                      onClose={() => setShowStagePicker(false)}
                    />
                  ) : null}
                </span>
                <span className="excel-picker">
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
                  {showColumnPicker ? (
                    <ExcelFilterPopover
                      hint="Colunas visíveis na tabela de alunos."
                      items={ALL_STUDENT_COLUMNS.map((c) => ({
                        id: c.key,
                        label: c.label,
                      }))}
                      selectedIds={
                        new Set(
                          ALL_STUDENT_COLUMNS.map((c) => c.key).filter(
                            (k) => !hiddenColumns.has(k),
                          ),
                        )
                      }
                      emptyMessage="Nenhuma coluna disponível."
                      onApply={(next) => {
                        setHiddenColumns(
                          new Set(
                            ALL_STUDENT_COLUMNS.map((c) => c.key).filter(
                              (k) => !next.has(k),
                            ),
                          ),
                        )
                        setShowColumnPicker(false)
                      }}
                      onClose={() => setShowColumnPicker(false)}
                    />
                  ) : null}
                </span>
                {relevantTrails.map((trail) => (
                  <button
                    key={trail.id}
                    type="button"
                    className="btn btn--small dashboard-export-button"
                    disabled={
                      filteredStudentRows.length === 0 ||
                      exportingTrailId !== null
                    }
                    onClick={() => void exportTrailHistoryXlsx(trail)}
                    title="Exporta os alunos, aulas e tópicos correspondentes aos filtros atuais"
                  >
                    {exportingTrailId === trail.id ? (
                      <>
                        <span
                          className="excel-picker__spinner"
                          aria-hidden="true"
                        />
                        Gerando…
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">↓</span>
                        Exportar XLSX
                      </>
                    )}
                  </button>
                ))}
              </p>
            </div>

            {hasActiveStudentExportFilters ? (
              <p className="dashboard-export-notice" role="status">
                <span aria-hidden="true">ⓘ</span>
                Filtros ativos: o arquivo incluirá os{' '}
                <strong>{filteredStudentRows.length} alunos</strong> exibidos e
                somente as aulas e tópicos selecionados.
              </p>
            ) : null}

            <div className="dashboard-filters">
              <label className="field dashboard-filter-name">
                <span>Buscar por nome ou telefone</span>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Nome ou telefone…"
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
                    paginatedStudentRows.map((row) => (
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
                            case 'lessonsReleased':
                              return (
                                <td key={c.key}>{row.lessonsReleased}</td>
                              )
                            case 'lessonsDone':
                              return <td key={c.key}>{row.lessonsDone}</td>
                            case 'lessonsCompletionPct':
                              return (
                                <td key={c.key}>
                                  <div className="progress">
                                    <div className="progress__bar">
                                      <div
                                        className="progress__fill"
                                        style={{
                                          width: `${row.lessonsCompletionPct ?? 0}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="progress__label">
                                      {formatPct(row.lessonsCompletionPct)}
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

            {sortedFilteredStudentRows.length > STUDENTS_PAGE_SIZE ? (
              <div className="dashboard-students-pagination">
                <span className="muted">
                  Mostrando {studentPageRange.start}–{studentPageRange.end} de{' '}
                  {sortedFilteredStudentRows.length} alunos
                </span>
                <div className="dashboard-students-pagination__actions">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={studentPage <= 1}
                    onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="dashboard-students-pagination__page">
                    Página {studentPage} de {studentPageCount}
                  </span>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={studentPage >= studentPageCount}
                    onClick={() =>
                      setStudentPage((p) => Math.min(studentPageCount, p + 1))
                    }
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Aulas — acertos e erros</h2>
              <p className="admin__actions gerenciamento-detail-actions">
                <span className="muted">
                  {sortedPillRows.length} de {pillRows.length}{' '}
                  {pillRows.length === 1 ? 'aula' : 'aulas'}
                </span>
                {pillExportTrails.map((trail) => (
                  <button
                    key={trail.id}
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={
                      pillRows.length === 0 || exportingPillTrailId !== null
                    }
                    onClick={() => void exportPillTrailXlsx(trail)}
                    title="Desempenho por aula; respeita filtros de matéria e mínimo de respostas"
                  >
                    {exportingPillTrailId === trail.id
                      ? 'Gerando XLSX…'
                      : `Baixar XLSX — ${trail.name || trail.id}`}
                  </button>
                ))}
              </p>
            </div>

            {pillRows.length === 0 ? (
              <p className="banner">
                Sem respostas corrigíveis ainda. Os acertos e erros aparecem
                aqui quando os alunos responderem aulas de exercício com
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
                            <LessonTopicCode
                              topicNumber={p.stageNumber}
                              lessonNumber={p.questionNumber}
                              content={p.content}
                              title={p.title}
                            />{' '}
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
                            <LessonTopicCode
                              topicNumber={p.stageNumber}
                              lessonNumber={p.questionNumber}
                              content={p.content}
                              title={p.title}
                            />{' '}
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
                          Tópico / Aula{pillSortIndicator('position')}
                        </th>
                        <th>Título</th>
                        <th>Enunciado</th>
                        <th>Gabarito</th>
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
                          <td colSpan={10} className="muted table__empty">
                            Nenhuma aula com pelo menos {pillMinResponses}{' '}
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
                              <LessonTopicCode
                                topicNumber={p.stageNumber}
                                lessonNumber={p.questionNumber}
                                content={p.content}
                                title={p.title}
                              />
                            </td>
                            <td>{p.title}</td>
                            <td>
                              <EnunciadoPreviewCell
                                content={p.content}
                                title={p.title}
                                onExpand={() =>
                                  setExpandedEnunciado({
                                    topicLabel: formatLessonTopicCode(
                                      p.stageNumber,
                                      p.questionNumber,
                                    ),
                                    title: p.title,
                                    trailName: p.trailName,
                                    text: p.content.trim() || p.title.trim(),
                                  })
                                }
                              />
                            </td>
                            <td>{p.gabarito}</td>
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

          {expandedEnunciado ? (
            <div
              className="message-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-enunciado-title"
              onClick={() => setExpandedEnunciado(null)}
            >
              <div
                className="message-modal__panel"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="message-modal__head">
                  <h3 id="dashboard-enunciado-title">Enunciado</h3>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setExpandedEnunciado(null)}
                  >
                    Fechar
                  </button>
                </div>
                <dl className="message-modal__meta">
                  <div>
                    <dt>Trilha</dt>
                    <dd>{expandedEnunciado.trailName}</dd>
                  </div>
                  <div>
                    <dt>Tópico / Aula</dt>
                    <dd>{expandedEnunciado.topicLabel}</dd>
                  </div>
                  <div>
                    <dt>Título</dt>
                    <dd>{expandedEnunciado.title}</dd>
                  </div>
                </dl>
                <div className="message-modal__body">{expandedEnunciado.text}</div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
