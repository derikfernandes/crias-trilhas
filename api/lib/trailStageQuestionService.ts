import type {
  DocumentSnapshot,
  Firestore,
  QuerySnapshot,
} from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'

import type { TrailStageQuestionCreatePayload } from './trailStageQuestionValidation'

export function trailStageQuestionDocId(
  trailId: string,
  stageNumber: number,
  questionNumber: number,
): string {
  return `${trailId}_stage_${stageNumber}_q_${questionNumber}`
}

export async function createTrailStageQuestion(
  db: Firestore,
  collectionName: string,
  data: TrailStageQuestionCreatePayload,
): Promise<{ id: string }> {
  const docId = trailStageQuestionDocId(data.trail_id, data.stage_number, data.question_number)
  const ref = db.collection(collectionName).doc(docId)
  const now = FieldValue.serverTimestamp()

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      throw new Error(
        `Conflito: question_number ${data.question_number} já existe para trail_id "${data.trail_id}" e stage_number ${data.stage_number}.`,
      )
    }
    tx.set(ref, {
      trail_id: data.trail_id,
      stage_number: data.stage_number,
      question_number: data.question_number,
      title: data.title,
      content: data.content,
      correct_option: data.correct_option,
      options: data.options,
      explanation: data.explanation,
      active: true,
      created_at: now,
      updated_at: now,
    })
  })

  return { id: docId }
}

export async function getTrailStageQuestionById(
  db: Firestore,
  collectionName: string,
  id: string,
): Promise<DocumentSnapshot> {
  return db.collection(collectionName).doc(id).get()
}

export async function getTrailStageQuestionByComposite(
  db: Firestore,
  collectionName: string,
  trailId: string,
  stageNumber: number,
  questionNumber: number,
): Promise<DocumentSnapshot> {
  const id = trailStageQuestionDocId(trailId, stageNumber, questionNumber)
  return getTrailStageQuestionById(db, collectionName, id)
}

export async function listTrailStageQuestionsForStage(
  db: Firestore,
  collectionName: string,
  trailId: string,
  stageNumber: number,
): Promise<QuerySnapshot> {
  return db
    .collection(collectionName)
    .where('trail_id', '==', trailId)
    .where('stage_number', '==', stageNumber)
    .orderBy('question_number', 'asc')
    .get()
}

export async function updateTrailStageQuestionFields(
  db: Firestore,
  collectionName: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .collection(collectionName)
    .doc(id)
    .update({
      ...patch,
      updated_at: FieldValue.serverTimestamp(),
    })
}

export async function deactivateTrailStageQuestion(
  db: Firestore,
  collectionName: string,
  id: string,
): Promise<void> {
  await updateTrailStageQuestionFields(db, collectionName, id, { active: false })
}
