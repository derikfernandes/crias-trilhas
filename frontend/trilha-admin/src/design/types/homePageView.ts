export type HomePageInstitutionRow = {
  id: string
  name: string
  type: string
  activeLabel: string
  url: string
  createdAtLabel: string
  detailHref: string
}

export type HomePageViewProps = {
  productionOriginLabel: string
  productionOriginHref: string
  canCreate: boolean
  rows: HomePageInstitutionRow[]
  loading: boolean
  error: string | null
  onCopyLink: (url: string) => void
}
