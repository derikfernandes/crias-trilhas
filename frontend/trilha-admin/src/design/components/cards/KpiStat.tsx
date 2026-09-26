import type { ReactNode } from 'react'

export type KpiBarTone = 'green' | 'yellow' | 'amber' | 'rose'

export type KpiStatProps = {
  label: string
  value: string
  hint?: string
  barPct?: number | null
  icon?: ReactNode
  barTone?: KpiBarTone
}

export function kpiBarToneFromPct(pct: number | null | undefined): KpiBarTone {
  if (pct == null || Number.isNaN(pct)) return 'green'
  if (pct >= 70) return 'green'
  if (pct >= 50) return 'amber'
  if (pct >= 30) return 'yellow'
  return 'rose'
}

export function KpiStat({
  label,
  value,
  hint,
  barPct,
  icon,
  barTone,
}: KpiStatProps) {
  const width =
    barPct == null || Number.isNaN(barPct)
      ? null
      : Math.max(0, Math.min(100, barPct))
  const tone = barTone ?? kpiBarToneFromPct(width)

  return (
    <div className="crias-kpi">
      <span className="crias-kpi__head">
        {icon ? (
          <span className="crias-kpi__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="crias-kpi__label">{label}</span>
      </span>
      <span className="crias-kpi__value">{value}</span>
      {width != null ? (
        <div
          className={`crias-kpi__bar crias-kpi__bar--${tone}`}
          aria-hidden="true"
        >
          <span style={{ width: `${width}%` }} />
        </div>
      ) : null}
      {hint ? <span className="crias-kpi__hint">{hint}</span> : null}
    </div>
  )
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="crias-kpi-grid">{children}</div>
}
