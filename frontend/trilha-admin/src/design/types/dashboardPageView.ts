export const DASHBOARD_STUDENT_COLUMNS = [
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

export type DashboardStudentColumnKey =
  (typeof DASHBOARD_STUDENT_COLUMNS)[number]['key']

export type DashboardStudentSortKey = 'name' | DashboardStudentColumnKey

export type DashboardPillSortKey =
  | 'trail'
  | 'position'
  | 'total'
  | 'correct'
  | 'wrong'
  | 'accuracyPct'

export type DashboardInstitutionOption = {
  id: string
  label: string
}

export type DashboardStudentRowView = {
  id: string
  name: string
  href: string
  phone: string
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

export type DashboardStudentColumnView = {
  key: DashboardStudentColumnKey
  label: string
  sortIndicator: string
}

export type DashboardTrailExportOption = {
  id: string
  label: string
}

export type DashboardPickerItem = {
  id: string
  label: string
}

export type DashboardSummaryView = {
  activeStudents: number
  activeTrails: number
  avgCompletion: number | null
  avgAccuracy: number | null
}

export type DashboardPillRowView = {
  key: string
  trailId: string
  trailHref: string
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

export type DashboardPageRange = {
  start: number
  end: number
}

export type DashboardPageViewProps = {
  loadingInst: boolean
  institutionOptions: DashboardInstitutionOption[]
  selectedId: string | null
  onSelectInstitution: (id: string | null) => void
  instError: string | null
  dataError: string | null
  exportError: string | null
  isDashboardLoading: boolean
  loadLabel: string
  loadPercent: number
  logsError: string | null
  onRetryLogs: () => void
  summary: DashboardSummaryView
  missingGabaritoCount: number
  filteredStudentCount: number
  totalStudentCount: number
  questionPickerLabel: string
  showQuestionPicker: boolean
  onToggleQuestionPicker: () => void
  questionPickerItems: DashboardPickerItem[]
  questionPickerSelectedIds: string[]
  onApplyQuestionPicker: (selectedIds: Set<string>) => void
  onCloseQuestionPicker: () => void
  stagePickerLabel: string
  showStagePicker: boolean
  onToggleStagePicker: () => void
  stagePickerItems: DashboardPickerItem[]
  stagePickerSelectedIds: string[]
  onApplyStagePicker: (selectedIds: Set<string>) => void
  onCloseStagePicker: () => void
  showColumnPicker: boolean
  onToggleColumnPicker: () => void
  columnPickerItems: DashboardPickerItem[]
  columnPickerSelectedIds: string[]
  onApplyColumnPicker: (selectedIds: Set<string>) => void
  onCloseColumnPicker: () => void
  studentExportTrails: DashboardTrailExportOption[]
  exportingTrailId: string | null
  onExportTrailHistory: (trailId: string) => void
  hasActiveStudentExportFilters: boolean
  nameFilter: string
  onNameFilterChange: (value: string) => void
  subjectFilter: string
  onSubjectFilterChange: (value: string) => void
  subjects: string[]
  pctMin: number
  pctMax: number
  onPctMinChange: (value: number) => void
  onPctMaxChange: (value: number) => void
  nameSortIndicator: string
  onToggleStudentSort: (key: DashboardStudentSortKey) => void
  visibleColumns: DashboardStudentColumnView[]
  studentRowsEmpty: boolean
  paginatedStudentRows: DashboardStudentRowView[]
  showStudentPagination: boolean
  studentPageRange: DashboardPageRange
  sortedFilteredStudentCount: number
  studentPage: number
  studentPageCount: number
  onStudentPagePrev: () => void
  onStudentPageNext: () => void
  sortedPillCount: number
  totalPillCount: number
  pillExportTrails: DashboardTrailExportOption[]
  exportingPillTrailId: string | null
  onExportPillTrail: (trailId: string) => void
  pillSubjectFilter: string
  onPillSubjectFilterChange: (value: string) => void
  pillMinResponses: number
  onPillMinResponsesChange: (value: number) => void
  worstPills: DashboardPillRowView[]
  bestPills: DashboardPillRowView[]
  onTogglePillSort: (key: DashboardPillSortKey) => void
  pillSortIndicator: (key: DashboardPillSortKey) => string
  sortedPillRows: DashboardPillRowView[]
}
