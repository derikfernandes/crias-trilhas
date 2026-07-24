export type GabaritoTrailOption = {
  id: string
  label: string
}

export type GabaritoNumberOption = {
  value: number
  label: string
}

export type GabaritoSortBy = 'stage' | 'question'
export type GabaritoSortDir = 'asc' | 'desc'

export type GabaritoSaveBanner =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string }

export type GabaritoQuestionRow = {
  id: string
  stageNumber: number
  questionNumber: number
  title: string
  content: string
  inputValue: string
  placeholder: string
  ariaLabel: string
  inputError: string | null
  statusBadge: 'editado' | 'preenchido' | 'faltando'
}

export type GabaritoPageViewProps = {
  loadingTrails: boolean
  trailOptions: GabaritoTrailOption[]
  selectedTrailId: string | null
  onSelectTrail: (id: string | null) => void
  onlyActiveTrails: boolean
  onOnlyActiveTrailsChange: (checked: boolean) => void
  trailsError: string | null
  selectedTrailName: string
  loadingData: boolean
  saveDisabled: boolean
  saveButtonLabel: string
  onSaveAll: () => void
  dataError: string | null
  saveBanner: GabaritoSaveBanner
  onlyMissing: boolean
  onOnlyMissingChange: (checked: boolean) => void
  filterStage: number | ''
  onFilterStageChange: (value: number | '') => void
  filterQuestion: number | ''
  onFilterQuestionChange: (value: number | '') => void
  availableStages: GabaritoNumberOption[]
  availableQuestions: GabaritoNumberOption[]
  filtersSummary: string
  sortBy: GabaritoSortBy
  sortDir: GabaritoSortDir
  onToggleSort: (column: GabaritoSortBy) => void
  rows: GabaritoQuestionRow[]
  emptyMessage: string
  onDraftChange: (questionId: string, value: string) => void
}
