/** Caminho interno da app (respeita `base` do Vite). */
export function institutionPath(id: string): string {
  const base = import.meta.env.BASE_URL
  if (base === '/') return `/instituicoes/${id}`
  return `${base.replace(/\/$/, '')}/instituicoes/${id}`
}

/** URL absoluta (útil no Postman, compartilhar, etc.). */
export function fullInstitutionUrl(id: string): string {
  return `${window.location.origin}${institutionPath(id)}`
}
