import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardPageViewProps } from '../types/dashboardPageView'
import { ExcelFilterPopover } from './dashboard/ExcelFilterPopover'
import { EnunciadoPreviewCell } from './dashboard/EnunciadoPreviewCell'
import { formatLessonTopicCode } from './dashboard/formatLessonTopicCode'
import { formatPct } from './dashboard/formatPct'
import { LessonTopicCode } from './dashboard/LessonTopicCode'
import { QuestionsCharts } from './dashboard/QuestionsCharts'
import { StudentsCharts } from './dashboard/StudentsCharts'
import { AgentUsageSection } from './dashboard/AgentUsageSection'
import { KpiGrid, KpiStat } from '../components/cards/KpiStat'
import { JourneyBands } from '../components/cards/JourneyBands'
import { CriasTabs } from '../components/navigation/CriasTabs'
import { PageEmpty, PageError } from '../components/feedback/PageState'
import { StatusTag } from '../components/ui/StatusTag'

export type {
  DashboardPageViewProps,
  DashboardStudentRowView,
  DashboardPillRowView,
} from '../types/dashboardPageView'

type ExpandedEnunciado = {
  topicLabel: string
  title: string
  trailName: string
  text: string
}

export function DashboardPageView({
  loadingInst,
  institutionOptions,
  selectedId,
  onSelectInstitution,
  activeTab,
  onActiveTabChange,
  isQuestionsTabLoading,
  instError,
  dataError,
  exportError,
  isDashboardLoading,
  loadLabel,
  loadPercent,
  logsError,
  onRetryLogs,
  summary,
  missingGabaritoCount,
  annulledGabaritoCount,
  annulledAnswersExcluded,
  filteredStudentCount,
  totalStudentCount,
  questionPickerLabel,
  showQuestionPicker,
  onToggleQuestionPicker,
  questionPickerItems,
  questionPickerSelectedIds,
  onApplyQuestionPicker,
  onCloseQuestionPicker,
  stagePickerLabel,
  showStagePicker,
  onToggleStagePicker,
  stagePickerItems,
  stagePickerSelectedIds,
  onApplyStagePicker,
  onCloseStagePicker,
  showColumnPicker,
  onToggleColumnPicker,
  columnPickerItems,
  columnPickerSelectedIds,
  onApplyColumnPicker,
  onCloseColumnPicker,
  studentExportTrails,
  exportingTrailId,
  onExportTrailHistory,
  hasActiveStudentExportFilters,
  nameFilter,
  onNameFilterChange,
  pctMin,
  pctMax,
  onPctMinChange,
  onPctMaxChange,
  nameSortIndicator,
  onToggleStudentSort,
  visibleColumns,
  studentRowsEmpty,
  paginatedStudentRows,
  showStudentPagination,
  studentPageRange,
  sortedFilteredStudentCount,
  studentPage,
  studentPageCount,
  onStudentPagePrev,
  onStudentPageNext,
  studentsCharts,
  studentChartFilter,
  onStudentChartFilterChange,
  sortedPillCount,
  totalPillCount,
  pillExportTrails,
  exportingPillTrailId,
  onExportPillTrail,
  pillSearch,
  onPillSearchChange,
  pillTrailFilter,
  onPillTrailFilterChange,
  pillTrailOptions,
  pillMinResponses,
  onPillMinResponsesChange,
  pillAccMin,
  pillAccMax,
  onPillAccMinChange,
  onPillAccMaxChange,
  questionsCharts,
  worstPills,
  bestPills,
  onTogglePillSort,
  pillSortIndicator,
  paginatedPillRows,
  showPillPagination,
  pillPageRange,
  pillPage,
  pillPageCount,
  onPillPagePrev,
  onPillPageNext,
  agentUsage,
  agentPeriodDays,
  onAgentPeriodDaysChange,
  agentUsageLoading,
  agentUsageUnavailable = false,
  selectedAgentTrailId,
  onSelectAgentTrailId,
  selectedAgentStudents,
  journeyBands,
  journeyStalledLinkLabel,
  journeyStalledHref,
  registeredStudentCount,
  agentCoverageOfActivePct,
  gradeOptions,
  selectedGrade,
  onSelectGrade,
  activityMatrix,
  selectedMatrixCellKey,
  onSelectMatrixCell,
  optionDistribution,
  ranking,
  topicDoubts,
  learningOpportunities,
}: DashboardPageViewProps) {
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

  const selectedInstitutionLabel =
    institutionOptions.find((o) => o.id === selectedId)?.label ?? null

  void ranking
  void topicDoubts
  void learningOpportunities

  return (
    <>
      <header className="admin__header dashboard-header">
        <div className="dashboard-header__intro">
          <h1>Visão geral</h1>
          {!isDashboardLoading ? (
            <p className="admin__lede muted">
              {selectedInstitutionLabel
                ? `${selectedInstitutionLabel} · engajamento, percurso e tutores`
                : 'Engajamento dos alunos, percurso e conversas com tutores.'}
            </p>
          ) : null}
        </div>
        <div className="gerenciamento-toolbar dashboard-header__toolbar">
          <label className="gerenciamento-select">
            <span className="muted">Instituição</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => {
                const next = e.target.value.trim()
                onSelectInstitution(next || null)
              }}
              disabled={loadingInst || institutionOptions.length === 0}
            >
              <option value="">
                {loadingInst
                  ? 'Carregando instituições…'
                  : 'Selecione uma instituição'}
              </option>
              {institutionOptions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.label}
                </option>
              ))}
            </select>
          </label>
          {gradeOptions && gradeOptions.length > 0 && onSelectGrade ? (
            <label className="gerenciamento-select">
              <span className="muted">Série</span>
              <select
                value={selectedGrade ?? ''}
                onChange={(e) => {
                  const next = e.target.value.trim()
                  onSelectGrade(next || null)
                }}
              >
                <option value="">Todas</option>
                {gradeOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
        <PageEmpty
          title="Selecione uma instituição"
          body="Escolha uma instituição para ver a visão geral."
        />
      ) : isDashboardLoading ? (
        <section
          className="dashboard-load-progress dashboard-load-progress--gate panel"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="dashboard-load-progress__head">
            <span className="dashboard-load-progress__label">
              {loadLabel || 'Carregando visão geral…'}
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
        <div data-testid="dashboard-logs-error">
          <PageError
            title="Não foi possível carregar as métricas"
            body={logsError}
            onRetry={onRetryLogs}
          />
        </div>
      ) : filteredStudentCount === 0 && totalStudentCount === 0 ? (
        <PageEmpty
          title="Nenhum aluno no período"
          body="Não há alunos cadastrados nesta instituição para montar a visão geral."
        />
      ) : (
        <>
          <KpiGrid>
            <KpiStat
              label="Alunos ativos"
              value={String(summary.activeStudents)}
              hint={
                registeredStudentCount != null
                  ? `de ${registeredStudentCount} cadastrados`
                  : `${summary.activeTrails} trilha(s) ativa(s)`
              }
              barPct={
                registeredStudentCount && registeredStudentCount > 0
                  ? (summary.activeStudents / registeredStudentCount) * 100
                  : null
              }
            />
            <KpiStat
              label="Progresso médio"
              value={formatPct(summary.avgCompletion, 1)}
              hint="Tópicos feitos ÷ liberados"
              barPct={summary.avgCompletion}
            />
            <KpiStat
              label="Acerto médio"
              value={formatPct(summary.avgAccuracy, 1)}
              hint="Respostas corretas ÷ total"
              barPct={summary.avgAccuracy}
            />
            <KpiStat
              label="Tutores"
              value={
                agentCoverageOfActivePct != null
                  ? formatPct(agentCoverageOfActivePct, 1)
                  : formatPct(agentUsage.coveragePct, 1)
              }
              hint="% dos ativos que conversaram"
              barPct={agentCoverageOfActivePct ?? agentUsage.coveragePct}
            />
          </KpiGrid>

          {journeyBands && journeyBands.length > 0 ? (
            <JourneyBands
              bands={journeyBands}
              stalledHref={journeyStalledHref}
              stalledLinkLabel={journeyStalledLinkLabel}
            />
          ) : null}

          {activityMatrix && activityMatrix.cells.length > 0 ? (
            <section className="crias-journey" aria-label="Mapa conteúdo a conteúdo">
              <div className="crias-journey__head">
                <div>
                  <div className="crias-label">Mapa conteúdo a conteúdo</div>
                  <h2
                    className="crias-section-title"
                    style={{ borderBottom: 0, paddingBottom: 0 }}
                  >
                    Acerto por atividade × exercício
                  </h2>
                </div>
              </div>
              <div className="crias-matrix">
                <table>
                  <thead>
                    <tr>
                      <th>Bloco \ Ativ.</th>
                      {activityMatrix.questions.map((q) => (
                        <th key={q}>A{q}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activityMatrix.stages.map((stage) => (
                      <tr key={stage}>
                        <th scope="row">B{stage}</th>
                        {activityMatrix.questions.map((q) => {
                          const cell = activityMatrix.cells.find(
                            (c) =>
                              c.stageNumber === stage &&
                              c.questionNumber === q,
                          )
                          if (!cell || cell.total === 0) {
                            return (
                              <td
                                key={`${stage}-${q}`}
                                className="crias-matrix__cell crias-matrix__cell--empty"
                              >
                                —
                              </td>
                            )
                          }
                          const pctVal = cell.accuracyPct ?? 0
                          const tone =
                            pctVal >= 70
                              ? 'crias-matrix__cell--high'
                              : pctVal >= 40
                                ? 'crias-matrix__cell--mid'
                                : 'crias-matrix__cell--low'
                          const selected =
                            selectedMatrixCellKey === cell.key
                          return (
                            <td key={`${stage}-${q}`}>
                              <button
                                type="button"
                                className={`crias-matrix__cell ${tone}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  onSelectMatrixCell?.(
                                    selected ? null : cell.key,
                                  )
                                }
                              >
                                {formatPct(cell.accuracyPct, 0)}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {optionDistribution && optionDistribution.length > 0 ? (
                <div className="crias-option-dist" aria-label="Distribuição A/B/C">
                  {optionDistribution.map((item) => (
                    <div key={item.option} className="crias-option-dist__item">
                      <span className="crias-option-dist__key">
                        {item.option}
                      </span>
                      {item.count} ({item.pct}%)
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <CriasTabs
            ariaLabel="Seções da visão geral"
            activeId={activeTab}
            onChange={(id) => onActiveTabChange(id as 'students' | 'questions')}
            items={[
              { id: 'students', label: 'Alunos' },
              { id: 'questions', label: 'Questões' },
            ]}
          />

          {activeTab === 'students' ? (
            <div
              id="dashboard-students-panel"
              className="trail-tab-panel"
              role="tabpanel"
            >
              {(annulledGabaritoCount > 0 || missingGabaritoCount > 0) && (
                <section className="dashboard-cards" style={{ marginBottom: 24 }}>
                  {annulledGabaritoCount > 0 ? (
                    <Link
                      to="/gabarito"
                      className="dashboard-card dashboard-card--muted"
                    >
                      <span className="dashboard-card__label">
                        Questões anuladas
                      </span>
                      <span className="dashboard-card__value">
                        {annulledGabaritoCount}
                      </span>
                      <span className="dashboard-card__hint">
                        {annulledAnswersExcluded > 0
                          ? `${annulledAnswersExcluded} resposta${annulledAnswersExcluded === 1 ? '' : 's'} fora do % de acerto`
                          : 'Nenhuma resposta de aluno nessas questões ainda'}
                      </span>
                    </Link>
                  ) : null}
                  {missingGabaritoCount > 0 ? (
                    <Link
                      to="/gabarito"
                      className="dashboard-card dashboard-card--warn"
                    >
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
              )}

          <AgentUsageSection
            agentUsage={agentUsage}
            periodDays={agentPeriodDays}
            onPeriodDaysChange={onAgentPeriodDaysChange}
            loading={agentUsageLoading}
            unavailable={agentUsageUnavailable}
            onRetry={onRetryLogs}
            selectedAgentTrailId={selectedAgentTrailId}
            onSelectAgentTrailId={onSelectAgentTrailId}
            selectedAgentStudents={selectedAgentStudents}
          />

          <section className="panel">
            <div className="panel__head">
              <h2>Alunos</h2>
              <p className="admin__actions gerenciamento-detail-actions">
                <span className="muted">
                  {filteredStudentCount} de {totalStudentCount} alunos
                </span>
                <span className="excel-picker">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={onToggleQuestionPicker}
                  >
                    Aulas
                    {questionPickerLabel}
                  </button>
                  {showQuestionPicker ? (
                    <ExcelFilterPopover
                      hint="Aulas incluídas no cálculo (por número no tópico da aula: A1, A2…)."
                      items={questionPickerItems}
                      selectedIds={new Set(questionPickerSelectedIds)}
                      emptyMessage="Nenhuma aula nas trilhas atuais."
                      onApply={onApplyQuestionPicker}
                      onClose={onCloseQuestionPicker}
                    />
                  ) : null}
                </span>
                <span className="excel-picker">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={onToggleStagePicker}
                  >
                    Tópicos
                    {stagePickerLabel}
                  </button>
                  {showStagePicker ? (
                    <ExcelFilterPopover
                      hint="Tópicos da aula incluídos no cálculo de aulas liberadas/feitas."
                      items={stagePickerItems}
                      selectedIds={new Set(stagePickerSelectedIds)}
                      emptyMessage="Nenhum tópico da aula nas trilhas atuais."
                      onApply={onApplyStagePicker}
                      onClose={onCloseStagePicker}
                    />
                  ) : null}
                </span>
                <span className="excel-picker">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={onToggleColumnPicker}
                  >
                    Colunas
                  </button>
                  {showColumnPicker ? (
                    <ExcelFilterPopover
                      hint="Colunas visíveis na tabela de alunos."
                      items={columnPickerItems}
                      selectedIds={new Set(columnPickerSelectedIds)}
                      emptyMessage="Nenhuma coluna disponível."
                      onApply={onApplyColumnPicker}
                      onClose={onCloseColumnPicker}
                    />
                  ) : null}
                </span>
                {studentExportTrails.map((trail) => (
                  <button
                    key={trail.id}
                    type="button"
                    className="btn btn--small dashboard-export-button"
                    disabled={
                      filteredStudentCount === 0 || exportingTrailId !== null
                    }
                    onClick={() => onExportTrailHistory(trail.id)}
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
                <strong>{filteredStudentCount} alunos</strong> exibidos e
                somente as aulas e tópicos selecionados.
              </p>
            ) : null}

            <div className="dashboard-filters">
              <label className="field dashboard-filter-name">
                <span>Buscar por nome ou telefone</span>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(e) => onNameFilterChange(e.target.value)}
                  placeholder="Nome ou telefone…"
                />
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
                    onChange={(e) => onPctMinChange(Number(e.target.value))}
                    aria-label="Percentual mínimo de conclusão"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pctMax}
                    onChange={(e) => onPctMaxChange(Number(e.target.value))}
                    aria-label="Percentual máximo de conclusão"
                  />
                </div>
              </div>
            </div>

            <StudentsCharts
              {...studentsCharts}
              selectedFilter={studentChartFilter}
              onFilterChange={onStudentChartFilterChange}
            />

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th
                      className="dashboard-sortable"
                      onClick={() => onToggleStudentSort('name')}
                    >
                      Nome{nameSortIndicator}
                    </th>
                    <th>Situação</th>
                    <th>Série</th>
                    {visibleColumns.map((c) => (
                      <th
                        key={c.key}
                        className="dashboard-sortable"
                        onClick={() => onToggleStudentSort(c.key)}
                      >
                        {c.label}
                        {c.sortIndicator}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentCount === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 3}
                        className="muted table__empty"
                      >
                        {studentRowsEmpty
                          ? 'Nenhum aluno nesta instituição.'
                          : 'Nenhum aluno corresponde aos filtros.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedStudentRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link className="table__name-link" to={row.href}>
                            {row.name || '—'}
                          </Link>
                        </td>
                        <td>
                          {row.situationLabel && row.situationTone ? (
                            <StatusTag
                              label={row.situationLabel}
                              tone={row.situationTone}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{row.schoolGrade?.trim() || '—'}</td>
                        {visibleColumns.map((c) => {
                          switch (c.key) {
                            case 'phone':
                              return (
                                <td key={c.key}>{row.phone || '—'}</td>
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

            {showStudentPagination ? (
              <div className="dashboard-students-pagination">
                <span className="muted">
                  Mostrando {studentPageRange.start}–{studentPageRange.end} de{' '}
                  {sortedFilteredStudentCount} alunos
                </span>
                <div className="dashboard-students-pagination__actions">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={studentPage <= 1}
                    onClick={onStudentPagePrev}
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
                    onClick={onStudentPageNext}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </section>
            </div>
          ) : null}

          {activeTab === 'questions' ? (
            <div
              id="dashboard-questions-panel"
              className="trail-tab-panel"
              role="tabpanel"
              aria-labelledby="dashboard-questions-tab"
            >
              {isQuestionsTabLoading ? (
                <section
                  className="panel dashboard-tab-loading"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span
                    className="excel-picker__spinner dashboard-tab-loading__spinner"
                    aria-hidden="true"
                  />
                  <div>
                    <strong>Carregando desempenho das questões…</strong>
                    <p className="muted">
                      Calculando acertos, erros e percentuais.
                    </p>
                  </div>
                </section>
              ) : (
                <section className="panel">
            <div className="panel__head">
              <h2>Aulas — acertos e erros</h2>
              <p className="admin__actions gerenciamento-detail-actions">
                <span className="muted">
                  {sortedPillCount} de {totalPillCount}{' '}
                  {totalPillCount === 1 ? 'aula' : 'aulas'}
                </span>
                {pillExportTrails.map((trail) => (
                  <button
                    key={trail.id}
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={
                      totalPillCount === 0 || exportingPillTrailId !== null
                    }
                    onClick={() => onExportPillTrail(trail.id)}
                    title="Desempenho por aula; respeita filtros ativos e mínimo de respostas"
                  >
                    {exportingPillTrailId === trail.id
                      ? 'Gerando XLSX…'
                      : `Baixar XLSX — ${trail.label}`}
                  </button>
                ))}
              </p>
            </div>

            {totalPillCount === 0 ? (
              <p className="banner">
                Sem respostas corrigíveis ainda. Os acertos e erros aparecem
                aqui quando os alunos responderem aulas de exercício com
                gabarito preenchido.{' '}
                <Link to="/gabarito">Preencher gabarito →</Link>
              </p>
            ) : (
              <>
                <div className="dashboard-filters dashboard-question-filters">
                  <label className="field dashboard-filter-name">
                    <span>Buscar questão</span>
                    <input
                      type="text"
                      value={pillSearch}
                      onChange={(e) => onPillSearchChange(e.target.value)}
                      placeholder="Título, enunciado, trilha, T3 A1…"
                    />
                  </label>
                  <label className="gerenciamento-select dashboard-filter-trail">
                    <span className="muted">Trilha</span>
                    <select
                      value={pillTrailFilter}
                      onChange={(e) => onPillTrailFilterChange(e.target.value)}
                    >
                      <option value="">Todas as trilhas</option>
                      {pillTrailOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
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
                        onPillMinResponsesChange(
                          Number.isFinite(n) && n >= 1 ? n : 1,
                        )
                      }}
                    />
                  </label>
                  <div className="dashboard-pct-filter">
                    <span className="muted">
                      % acerto: {Math.min(pillAccMin, pillAccMax)}–
                      {Math.max(pillAccMin, pillAccMax)}%
                    </span>
                    <div className="dashboard-pct-filter__sliders">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={pillAccMin}
                        onChange={(e) =>
                          onPillAccMinChange(Number(e.target.value))
                        }
                        aria-label="Percentual mínimo de acerto"
                      />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={pillAccMax}
                        onChange={(e) =>
                          onPillAccMaxChange(Number(e.target.value))
                        }
                        aria-label="Percentual máximo de acerto"
                      />
                    </div>
                  </div>
                  <div
                    className="dashboard-question-student-count"
                    aria-live="polite"
                  >
                    <span>Alunos considerados</span>
                    <strong>{questionsCharts.studentCount}</strong>
                    <small>
                      {questionsCharts.studentCount === 1
                        ? 'aluno com respostas'
                        : 'alunos com respostas'}
                    </small>
                  </div>
                </div>

                <QuestionsCharts {...questionsCharts} />

                {sortedPillCount > 0 ? (
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
                            {p.title}{' '}
                            <span className="muted">({p.trailName})</span>
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
                            {p.title}{' '}
                            <span className="muted">({p.trailName})</span>
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
                          onClick={() => onTogglePillSort('trail')}
                        >
                          Trilha{pillSortIndicator('trail')}
                        </th>
                        <th>Matéria</th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => onTogglePillSort('position')}
                        >
                          Tópico / Aula{pillSortIndicator('position')}
                        </th>
                        <th>Título</th>
                        <th>Enunciado</th>
                        <th>Gabarito</th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => onTogglePillSort('total')}
                        >
                          Respostas{pillSortIndicator('total')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => onTogglePillSort('correct')}
                        >
                          Acertos{pillSortIndicator('correct')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => onTogglePillSort('wrong')}
                        >
                          Erros{pillSortIndicator('wrong')}
                        </th>
                        <th
                          className="dashboard-sortable"
                          onClick={() => onTogglePillSort('accuracyPct')}
                        >
                          % acerto{pillSortIndicator('accuracyPct')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPillCount === 0 ? (
                        <tr>
                          <td colSpan={10} className="muted table__empty">
                            Nenhuma aula corresponde aos filtros atuais.
                          </td>
                        </tr>
                      ) : (
                        paginatedPillRows.map((p) => (
                          <tr key={p.key}>
                            <td>
                              <Link
                                className="table__name-link"
                                to={p.trailHref}
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

                {showPillPagination ? (
                  <div className="dashboard-students-pagination">
                    <span className="muted">
                      Mostrando {pillPageRange.start}–{pillPageRange.end} de{' '}
                      {sortedPillCount} aulas
                    </span>
                    <div className="dashboard-students-pagination__actions">
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        disabled={pillPage <= 1}
                        onClick={onPillPagePrev}
                      >
                        Anterior
                      </button>
                      <span className="dashboard-students-pagination__page">
                        Página {pillPage} de {pillPageCount}
                      </span>
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        disabled={pillPage >= pillPageCount}
                        onClick={onPillPageNext}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
                </section>
              )}
            </div>
          ) : null}

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
