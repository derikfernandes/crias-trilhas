import type { Timestamp } from 'firebase/firestore'

export interface TrailStage {
  id: string
  trail_id: string
  stage_number: number
  title: string
  is_released: boolean
  active: boolean
  created_at: Timestamp | null
  updated_at: Timestamp | null
}

