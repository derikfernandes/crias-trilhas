import { useState } from 'react'
import {
  stepTypeLabel,
  type UnitSection,
} from '../../../lib/trilha/unitMap'

export type UnitMapProps = {
  sections: UnitSection[]
  currentAnchorId?: string
}

export function UnitMap({
  sections,
  currentAnchorId = 'trilha-unit-current',
}: UnitMapProps) {
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {}
    for (const s of sections) {
      init[s.stageNumber] = !s.collapsed
    }
    return init
  })

  if (sections.length === 0) return null

  return (
    <section className="trilha-unit" aria-labelledby="trilha-unit-heading">
      <h2 id="trilha-unit-heading" className="trilha-unit__heading">
        Percurso por etapa
      </h2>
      <p className="trilha-unit__lead muted">
        Unidades da trilha — só o passo atual fica em foco; o resto não revela
        conteúdo futuro.
      </p>
      <div className="trilha-unit__sections">
        {sections.map((section) => {
          const isOpen = open[section.stageNumber] ?? !section.collapsed
          const canToggle =
            section.status === 'done' ||
            (section.status === 'ahead' && section.steps.length === 0) ||
            section.steps.length > 0
          const panelId = `trilha-unit-panel-${section.stageNumber}`

          return (
            <div
              key={section.stageNumber}
              className={`trilha-unit__section trilha-unit__section--${section.status}`}
            >
              <button
                type="button"
                className="trilha-unit__toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                disabled={section.status === 'ahead' && section.steps.length === 0}
                onClick={() =>
                  setOpen((prev) => ({
                    ...prev,
                    [section.stageNumber]: !isOpen,
                  }))
                }
              >
                <span className="trilha-unit__toggle-label">
                  {section.summary}
                </span>
                {canToggle && section.status !== 'ahead' ? (
                  <span className="trilha-unit__chevron" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                ) : null}
              </button>

              {isOpen && section.steps.length > 0 ? (
                <ol id={panelId} className="trilha-unit__steps">
                  {section.steps.map((step) => {
                    const isFocus =
                      step.state === 'current' || step.state === 'paused'
                    const typeLabel = stepTypeLabel(step.stepType)
                    return (
                      <li
                        key={`${step.stageNumber}-${step.questionNumber}`}
                        id={isFocus ? currentAnchorId : undefined}
                        className={`trilha-unit__step trilha-unit__step--${step.state}`}
                        aria-current={isFocus ? 'step' : undefined}
                      >
                        <span
                          className="trilha-unit__dot"
                          aria-hidden="true"
                          data-state={step.state}
                        />
                        <span className="trilha-unit__step-body">
                          <span className="trilha-unit__step-title">
                            {step.state === 'done' && step.title
                              ? step.title
                              : step.state === 'current'
                                ? 'Agora'
                                : step.state === 'paused'
                                  ? 'Pausado'
                                  : step.state === 'upcoming'
                                    ? 'Próximo'
                                    : `Questão ${step.questionNumber}`}
                          </span>
                          <span className="trilha-unit__step-meta muted">
                            Questão {step.questionNumber}
                            {typeLabel ? ` · ${typeLabel}` : null}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
