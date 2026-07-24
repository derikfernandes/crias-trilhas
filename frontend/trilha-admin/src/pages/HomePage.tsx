import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  formatInstitutionTs,
  INSTITUTIONS_COLLECTION,
  snapshotToInstitution,
} from '../lib/institutionFirestore'
import { fullInstitutionUrl, institutionPath } from '../lib/paths'
import { PRODUCTION_APP_ORIGIN } from '../lib/site'
import { usePermissions } from '../hooks/usePermissions'
import type { Institution } from '../types/institution'
import { HomePageView } from '../design/views/HomePageView'
import type { HomePageInstitutionRow } from '../design/types/homePageView'

export function HomePage() {
  const { canNav, filterInstitutions } = usePermissions()
  const [items, setItems] = useState<Institution[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const sortedItems = useMemo(() => {
    return filterInstitutions(items).sort((a, b) => {
      const ma = a.updated_at?.toMillis?.() ?? a.created_at?.toMillis?.() ?? 0
      const mb = b.updated_at?.toMillis?.() ?? b.created_at?.toMillis?.() ?? 0
      return mb - ma
    })
  }, [items, filterInstitutions])

  useEffect(() => {
    let unsub: (() => void) | null = null

    async function run() {
      if (!db) {
        setLoadingList(false)
        return
      }

      setLoadingList(true)
      unsub = onSnapshot(
        collection(db, INSTITUTIONS_COLLECTION),
        (snap) => {
          setItems(snap.docs.map(snapshotToInstitution))
          setListError(null)
          setLoadingList(false)
        },
        (err) => {
          setListError(err.message)
          setLoadingList(false)
        },
      )
    }

    void run()
    return () => unsub?.()
  }, [])

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.alert('Não foi possível copiar. Copie manualmente.')
    }
  }

  const rows: HomePageInstitutionRow[] = sortedItems.map((row) => {
    const url = fullInstitutionUrl(row.id)
    return {
      id: row.id,
      name: row.name || '—',
      type: row.type || '—',
      activeLabel: row.active ? 'Sim' : 'Não',
      url,
      createdAtLabel: formatInstitutionTs(row.created_at),
      detailHref: institutionPath(row.id),
    }
  })

  return (
    <HomePageView
      productionOriginHref={PRODUCTION_APP_ORIGIN}
      productionOriginLabel={PRODUCTION_APP_ORIGIN.replace(/^https?:\/\//, '')}
      canCreate={canNav('institution_new')}
      rows={rows}
      loading={loadingList}
      error={listError}
      onCopyLink={(url) => void copyLink(url)}
    />
  )
}
