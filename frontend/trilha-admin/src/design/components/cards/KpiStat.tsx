import type { ReactNode } from 'react'

export type KpiStatProps = {
  label: string
  value: string
  hint?: string
  barPct?: number | null
}

export function KpiStat({ label, value, hint, barPct }: KpiStatProps) {
  const width =
    barPct == null || Number.isNaN(barPct)
      ? null
      : Math.max(0, Math.min(100, barPct))

  return (
    <div className="crias-kpi">
      <span className="crias-kpi__label">{label}</span>
      <span className="crias-kpi__value">{value}</span>
      {hint ? <span className="crias-kpi__hint">{hint}</span> : null}
      {width != null ? (
        <div className="crias-kpi__bar" aria-hidden="true">
          <span style={{ width: `${width}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="crias-kpi-grid">{children}</div>
}
