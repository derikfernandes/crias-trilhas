import { PRODUCTION_APP_ORIGIN } from './site'

/**
 * Origem dos links públicos e do campo `public_link`. Sempre o domínio de produção
 * (`crias-ai.vercel.app`), salvo override explícito — inclusive em `npm run dev`, para
 * não aparecer `localhost` em URLs compartilháveis.
 * Para links locais raros: `VITE_PUBLIC_APP_ORIGIN=http://localhost:5173` no `.env`.
 */
export function publicAppOrigin(): string {
  const explicit = import.meta.env.VITE_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '')
  if (explicit) return explicit
  return PRODUCTION_APP_ORIGIN
}

/** Caminho interno da app (respeita `base` do Vite). */
export function institutionPath(id: string): string {
  const base = import.meta.env.BASE_URL
  if (base === '/') return `/instituicoes/${id}`
  return `${base.replace(/\/$/, '')}/instituicoes/${id}`
}

/** URL absoluta (útil no Postman, compartilhar, etc.). */
export function fullInstitutionUrl(id: string): string {
  return `${publicAppOrigin()}${institutionPath(id)}`
}
