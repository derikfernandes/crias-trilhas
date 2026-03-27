import type { Timestamp } from 'firebase/firestore'

export interface Trail {
  id: string
  institution_id: string
  name: string
  description: string
  subject: string
  default_total_steps_per_stage: number
  active: boolean
  created_at: Timestamp | null
  updated_at: Timestamp | null
}

