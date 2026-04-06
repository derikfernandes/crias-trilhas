/**
 * Data/hora atual no fuso America/Sao_Paulo (Brasília), no instante da chamada.
 * Formato ISO-like sem sufixo Z: YYYY-MM-DDTHH:mm:ss (horário de parede em SP).
 */
export function formatDateTimeBrasilia(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }

  const y = map.year ?? '1970'
  const m = map.month ?? '01'
  const d = map.day ?? '01'
  const h = map.hour ?? '00'
  const min = map.minute ?? '00'
  const s = map.second ?? '00'

  return `${y}-${m}-${d}T${h}:${min}:${s}`
}
