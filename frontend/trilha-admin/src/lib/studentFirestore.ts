import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { Student } from '../types/student'

export const STUDENTS_COLLECTION = 'students'

export function snapshotToStudent(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): Student {
  const data = d.data()
  if (!data) {
    return {
      id: d.id,
      institution_id: '',
      name: '',
      phone_number: '',
      school_level: 'fundamental',
      school_grade: '',
      student_level: 2,
      active: false,
      created_at: null,
      updated_at: null,
    }
  }

  const rawStudentLevel = data.student_level
  const student_level =
    typeof rawStudentLevel === 'number' &&
    (rawStudentLevel === 1 || rawStudentLevel === 2 || rawStudentLevel === 3)
      ? rawStudentLevel
      : 2

  return {
    id: d.id,
    institution_id: typeof data.institution_id === 'string' ? data.institution_id : '',
    name: typeof data.name === 'string' ? data.name : '',
    phone_number:
      typeof data.phone_number === 'string'
        ? data.phone_number.replace(/\D/g, '')
        : typeof data.phone_number === 'number'
          ? String(data.phone_number).replace(/\D/g, '')
          : '',
    school_level:
      typeof data.school_level === 'string' ? data.school_level : 'fundamental',
    school_grade:
      typeof data.school_grade === 'string' ? data.school_grade : '',
    student_level,
    active: typeof data.active === 'boolean' ? data.active : false,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  }
}

export function formatStudentTs(value: Student['created_at']): string {
  if (!value || typeof value.toDate !== 'function') return '—'
  try {
    return value.toDate().toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

