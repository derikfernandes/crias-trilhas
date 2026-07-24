export function formatPct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}
