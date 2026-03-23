import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { Institution } from '../types/institution'

export const INSTITUTIONS_COLLECTION = 'institutions'

export function snapshotToInstitution(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): Institution {
  const data = d.data()
  if (!data) {
    return {
      id: d.id,
      name: '',
      type: '',
      active: false,
      created_at: null,
      updated_at: null,
    }
  }
  return {
    id: d.id,
    name: typeof data.name === 'string' ? data.name : '',
    type: typeof data.type === 'string' ? data.type : '',
    active: Boolean(data.active),
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
    public_link:
      typeof data.public_link === 'string' ? data.public_link : undefined,
  }
}

export function formatInstitutionTs(
  value: Institution['created_at'],
): string {
  if (!value || typeof value.toDate !== 'function') return '—'
  try {
    return value.toDate().toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}
