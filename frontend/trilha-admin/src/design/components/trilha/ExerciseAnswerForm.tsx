import type { FormEvent } from 'react'

export type ExerciseAnswerFormProps = {
  options: string[] | null
  value: string
  submitting: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}

export function ExerciseAnswerForm({
  options,
  value,
  submitting,
  onChange,
  onSubmit,
  disabled = false,
}: ExerciseAnswerFormProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!disabled && !submitting && value.trim()) onSubmit()
  }

  return (
    <form className="trilha-exercise" onSubmit={handleSubmit}>
      {options && options.length > 0 ? (
        <fieldset className="trilha-exercise__options" disabled={disabled || submitting}>
          <legend className="trilha-exercise__legend">Escolha uma opção</legend>
          <ul className="trilha-exercise__list">
            {options.map((opt) => {
              const id = `ex-opt-${opt.slice(0, 24).replace(/\s+/g, '-')}`
              return (
                <li key={opt}>
                  <label className="trilha-exercise__option" htmlFor={id}>
                    <input
                      id={id}
                      type="radio"
                      name="exercise-answer"
                      value={opt}
                      checked={value === opt}
                      onChange={() => onChange(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ) : (
        <label className="field trilha-exercise__text">
          <span>Sua resposta</span>
          <textarea
            className="field__textarea"
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || submitting}
            required
          />
        </label>
      )}

      <button
        type="submit"
        className="btn btn--primary trilha-cta"
        disabled={disabled || submitting || !value.trim()}
        aria-busy={submitting || undefined}
      >
        {submitting ? 'A enviar…' : 'Enviar resposta'}
      </button>
    </form>
  )
}
