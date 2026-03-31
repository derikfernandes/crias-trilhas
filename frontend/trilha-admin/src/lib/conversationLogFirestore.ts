import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore'

import type { ConversationLog } from '../types/conversationLog'

export const CONVERSATION_LOGS_COLLECTION = 'conversation_logs'

export function snapshotToConversationLog(
  d: DocumentSnapshot | QueryDocumentSnapshot,
): ConversationLog {
  const data = d.data()
  if (!data) {
    return {
      id: d.id,
      student_id: '',
      trail_id: '',
      stage_number: 0,
      question_number: 0,
      sender: 'system',
      message_text: '',
      institution_id: null,
      message_type: null,
      metadata: null,
      created_at: null,
    }
  }

  const stageRaw = (data as Record<string, unknown>).stage_number
  const questionRaw = (data as Record<string, unknown>).question_number

  const stage_number =
    typeof stageRaw === 'number' && Number.isFinite(stageRaw) && stageRaw >= 1
      ? stageRaw
      : 0
  const question_number =
    typeof questionRaw === 'number' &&
    Number.isFinite(questionRaw) &&
    questionRaw >= 1
      ? questionRaw
      : 0

  const senderRaw = (data as Record<string, unknown>).sender
  const sender =
    senderRaw === 'student' || senderRaw === 'system' ? senderRaw : 'system'

  const typeRaw = (data as Record<string, unknown>).message_type
  const message_type =
    typeRaw === 'text' ||
    typeRaw === 'instruction' ||
    typeRaw === 'exercise' ||
    typeRaw === 'feedback'
      ? typeRaw
      : null

  const metadata =
    (data as Record<string, unknown>).metadata &&
    typeof (data as Record<string, unknown>).metadata === 'object' &&
    !Array.isArray((data as Record<string, unknown>).metadata)
      ? ((data as Record<string, unknown>).metadata as Record<string, unknown>)
      : null

  return {
    id: d.id,
    student_id:
      typeof (data as Record<string, unknown>).student_id === 'string'
        ? ((data as Record<string, unknown>).student_id as string)
        : '',
    trail_id:
      typeof (data as Record<string, unknown>).trail_id === 'string'
        ? ((data as Record<string, unknown>).trail_id as string)
        : '',
    stage_number,
    question_number,
    sender,
    message_text:
      typeof (data as Record<string, unknown>).message_text === 'string'
        ? ((data as Record<string, unknown>).message_text as string)
        : '',
    institution_id:
      typeof (data as Record<string, unknown>).institution_id === 'string'
        ? ((data as Record<string, unknown>).institution_id as string)
        : null,
    message_type,
    metadata,
    created_at: (data as Record<string, unknown>).created_at ?? null,
  }
}

