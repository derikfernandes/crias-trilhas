import type { Firestore } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'

import { contentFingerprint } from './contentFingerprint'
import {
  parsePositiveInt,
  parseProgressVersion,
  parseStatus,
  questionDocId,
  studentTrailDocId,
} from './enrollment'
import { TrailEngineError } from './errors'
import type {
  AdvanceReason,
  AdvanceResult,
  CollectionNames,
  ComputedAdvance,
  LegacyPrimitive,
  StudentTrailStatus,
  TrailChannel,
} from './types'
import { defaultCollectionNames } from './types'

export type AdvanceInput = {
  student_id: string
  trail_id: string
  idempotency_key: string
  channel: TrailChannel
  reason: AdvanceReason
  expected_version?: number
  /** Quando reason=legacy_primitive: comportamento Chatis 2.4 (blind +1). */
  legacy_primitive?: LegacyPrimitive
  /** Quando reason=legacy_update_position. */
  set_stage?: number
  set_question?: number
  /** Atualiza last_delivered após advance bem-sucedido (fachada). */
  mark_delivered?: boolean
}

/**
 * Semântica de advance alinhada a Chatis 2.4 + specs/tests.yaml.
 * TOTAL_STAGE = default_total_steps_per_stage.
 */
export function computeSemanticAdvance(input: {
  current_stage_number: number
  current_question_number: number
  total_stages: number
  total_questions: number
  status: StudentTrailStatus
}): ComputedAdvance {
  const {
    current_stage_number: stage,
    current_question_number: question,
    total_stages,
    total_questions,
    status,
  } = input

  if (status === 'completed') {
    return {
      next_stage_number: stage,
      next_question_number: question,
      completed: true,
      status: 'completed',
    }
  }
  if (status === 'blocked') {
    return {
      next_stage_number: stage,
      next_question_number: question,
      completed: false,
      status: 'blocked',
    }
  }

  const safeTotalStages = Math.max(1, total_stages)
  const safeTotalQuestions = Math.max(1, total_questions)

  // Se já estamos no último step da última questão → complete
  if (stage >= safeTotalStages && question >= safeTotalQuestions) {
    return {
      next_stage_number: stage,
      next_question_number: question,
      completed: true,
      status: 'completed',
    }
  }

  if (stage < safeTotalStages) {
    return {
      next_stage_number: stage + 1,
      next_question_number: question,
      completed: false,
      status: 'in_progress',
    }
  }

  // stage == TOTAL → wrap: stage=1, question++
  const nextQuestion = question + 1
  if (nextQuestion > safeTotalQuestions) {
    return {
      next_stage_number: 1,
      next_question_number: question,
      completed: true,
      status: 'completed',
    }
  }

  return {
    next_stage_number: 1,
    next_question_number: nextQuestion,
    completed: false,
    status: 'in_progress',
  }
}

export function computeLegacyPrimitiveAdvance(input: {
  current_stage_number: number
  current_question_number: number
  status: StudentTrailStatus
  primitive: LegacyPrimitive
}): ComputedAdvance {
  if (input.status === 'completed' || input.status === 'blocked') {
    return {
      next_stage_number: input.current_stage_number,
      next_question_number: input.current_question_number,
      completed: input.status === 'completed',
      status: input.status,
    }
  }

  if (input.primitive === 'advance_stage') {
    return {
      next_stage_number: input.current_stage_number + 1,
      next_question_number: input.current_question_number,
      completed: false,
      status: 'in_progress',
    }
  }

  return {
    next_stage_number: input.current_stage_number,
    next_question_number: input.current_question_number + 1,
    completed: false,
    status: 'in_progress',
  }
}

/** Decide replay / conflict / proceed para Idempotency-Key. */
export function resolveIdempotencyDecision(input: {
  last_key: string | null
  incoming_key: string
  /** Snapshot serializado da última resposta (opcional satélite). */
  stored_effect?: string | null
  incoming_effect: string
}): 'replay' | 'conflict' | 'proceed' {
  if (!input.last_key || input.last_key !== input.incoming_key) {
    return 'proceed'
  }
  if (
    input.stored_effect != null &&
    input.stored_effect !== input.incoming_effect
  ) {
    return 'conflict'
  }
  return 'replay'
}

function effectFingerprint(computed: ComputedAdvance, reason: string): string {
  return [
    reason,
    computed.next_stage_number,
    computed.next_question_number,
    computed.completed ? '1' : '0',
    computed.status,
  ].join('|')
}

async function loadTrailTotals(
  db: Firestore,
  trailId: string,
  stageNumber: number,
  collections: CollectionNames,
): Promise<{ total_stages: number; total_questions: number }> {
  const trailSnap = await db.collection(collections.trails).doc(trailId).get()
  if (!trailSnap.exists) {
    throw new TrailEngineError('not_found', `Trilha "${trailId}" não encontrada.`)
  }
  const trailData = (trailSnap.data() ?? {}) as Record<string, unknown>
  const total_stages = parsePositiveInt(
    trailData.default_total_steps_per_stage,
    1,
  )

  const questionsSnap = await db
    .collection(collections.trailStageQuestions)
    .where('trail_id', '==', trailId)
    .where('stage_number', '==', stageNumber)
    .get()

  let maxQ = 0
  for (const doc of questionsSnap.docs) {
    const q = (doc.data() ?? {}) as Record<string, unknown>
    const n = parsePositiveInt(q.question_number, 0)
    if (n > maxQ) maxQ = n
  }

  // Fallback: tenta doc canônico da questão atual se query vazia
  if (maxQ < 1) {
    const qSnap = await db
      .collection(collections.trailStageQuestions)
      .doc(questionDocId(trailId, stageNumber, 1))
      .get()
    maxQ = qSnap.exists ? 1 : 1
  }

  return { total_stages, total_questions: Math.max(1, maxQ) }
}

/**
 * Advance com Idempotency-Key + progress_version (I7 / ADR-005).
 * Primitivos legado (advance_stage/question) mantêm efeito Chatis 2.4.
 */
export async function advance(
  db: Firestore,
  input: AdvanceInput,
  collections: CollectionNames = defaultCollectionNames(),
): Promise<AdvanceResult> {
  const studentId = input.student_id.trim()
  const trailId = input.trail_id.trim()
  const key = input.idempotency_key?.trim()

  if (!studentId || !trailId) {
    throw new TrailEngineError(
      'invalid_payload',
      'student_id e trail_id são obrigatórios.',
    )
  }
  if (!key) {
    throw new TrailEngineError(
      'invalid_payload',
      'Idempotency-Key é obrigatória para advance.',
    )
  }

  const docId = studentTrailDocId(studentId, trailId)
  const ref = db.collection(collections.studentTrails).doc(docId)
  const idemRef = db
    .collection(collections.idempotencyKeys)
    .doc(`${studentId}_${trailId}_${key}`)
  const now = FieldValue.serverTimestamp()

  // Pré-carrega totais fora da tx quando necessário (semantic).
  let totals: { total_stages: number; total_questions: number } | null = null
  if (input.reason !== 'legacy_primitive' && input.reason !== 'legacy_update_position') {
    // stage atual será lido na tx; usamos um peek rápido
    const peek = await ref.get()
    if (!peek.exists) {
      throw new TrailEngineError(
        'not_found',
        'Progresso da trilha não encontrado para este aluno.',
      )
    }
    const peekData = (peek.data() ?? {}) as Record<string, unknown>
    const stage = parsePositiveInt(peekData.current_stage_number, 1)
    totals = await loadTrailTotals(db, trailId, stage, collections)
  }

  type TxResult =
    | { kind: 'ok' | 'replay'; result: AdvanceResult }
    | { kind: 'error'; error: TrailEngineError }

  const txResult = await db.runTransaction(async (tx): Promise<TxResult> => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      return {
        kind: 'error',
        error: new TrailEngineError(
          'not_found',
          'Progresso da trilha não encontrado para este aluno.',
        ),
      }
    }

    const data = (snap.data() ?? {}) as Record<string, unknown>
    const status = parseStatus(data.status)
    const current_stage_number = parsePositiveInt(data.current_stage_number, 1)
    const current_question_number = parsePositiveInt(
      data.current_question_number,
      1,
    )
    const progress_version = parseProgressVersion(data.progress_version)
    const last_key =
      typeof data.last_idempotency_key === 'string'
        ? data.last_idempotency_key
        : null

    if (
      input.expected_version !== undefined &&
      input.expected_version !== progress_version
    ) {
      return {
        kind: 'error',
        error: new TrailEngineError(
          'conflict',
          'progress_version divergente; re-fetch getNextContent.',
          {
            expected_version: input.expected_version,
            current_version: progress_version,
            current_stage_number,
            current_question_number,
            status,
          },
        ),
      }
    }

    let computed: ComputedAdvance

    if (input.reason === 'legacy_update_position') {
      const nextStage =
        input.set_stage !== undefined
          ? input.set_stage
          : current_stage_number
      const nextQuestion =
        input.set_question !== undefined
          ? input.set_question
          : current_question_number
      if (nextStage < 1 || nextQuestion < 1) {
        return {
          kind: 'error',
          error: new TrailEngineError(
            'invalid_payload',
            'stage/question devem ser >= 1.',
          ),
        }
      }
      computed = {
        next_stage_number: nextStage,
        next_question_number: nextQuestion,
        completed: status === 'completed',
        status: status === 'not_started' ? 'in_progress' : status,
      }
    } else if (input.reason === 'legacy_primitive') {
      const primitive = input.legacy_primitive
      if (!primitive) {
        return {
          kind: 'error',
          error: new TrailEngineError(
            'invalid_payload',
            'legacy_primitive obrigatório.',
          ),
        }
      }
      if (status === 'completed' || status === 'blocked') {
        return {
          kind: 'error',
          error: new TrailEngineError(
            status === 'completed' ? 'completed' : 'blocked',
            `Não é possível avançar quando o status é "${status}".`,
          ),
        }
      }
      computed = computeLegacyPrimitiveAdvance({
        current_stage_number,
        current_question_number,
        status,
        primitive,
      })
    } else {
      if (status === 'completed') {
        return {
          kind: 'error',
          error: new TrailEngineError(
            'completed',
            'Trilha já concluída; advance recusado.',
          ),
        }
      }
      if (status === 'blocked') {
        return {
          kind: 'error',
          error: new TrailEngineError(
            'blocked',
            'Trilha bloqueada; advance recusado.',
          ),
        }
      }
      const t = totals ?? { total_stages: 1, total_questions: 1 }
      computed = computeSemanticAdvance({
        current_stage_number,
        current_question_number,
        total_stages: t.total_stages,
        total_questions: t.total_questions,
        status,
      })
    }

    const effect = effectFingerprint(computed, input.reason)
    const idemSnap = await tx.get(idemRef)
    const storedEffect =
      idemSnap.exists &&
      typeof (idemSnap.data() as Record<string, unknown>)?.effect === 'string'
        ? ((idemSnap.data() as Record<string, unknown>).effect as string)
        : last_key === key
          ? effect
          : null

    const decision = resolveIdempotencyDecision({
      last_key,
      incoming_key: key,
      stored_effect: storedEffect,
      incoming_effect: effect,
    })

    if (decision === 'conflict') {
      return {
        kind: 'error',
        error: new TrailEngineError(
          'conflict',
          'Idempotency-Key reutilizada com efeito incompatível.',
          { idempotency_key: key },
        ),
      }
    }

    if (decision === 'replay') {
      const replay: AdvanceResult = {
        status: 'replay',
        student_id: studentId,
        trail_id: trailId,
        next_stage_number: current_stage_number,
        next_question_number: current_question_number,
        completed: status === 'completed',
        progress_version,
        channel: input.channel,
        idempotency_key: key,
      }
      // Se satélite tem snapshot, preferir
      if (idemSnap.exists) {
        const d = (idemSnap.data() ?? {}) as Record<string, unknown>
        const snapResult = d.response_snapshot
        if (snapResult && typeof snapResult === 'object') {
          const s = snapResult as Record<string, unknown>
          return {
            kind: 'replay',
            result: {
              status: 'replay',
              student_id: studentId,
              trail_id: trailId,
              next_stage_number: parsePositiveInt(
                s.next_stage_number,
                current_stage_number,
              ),
              next_question_number: parsePositiveInt(
                s.next_question_number,
                current_question_number,
              ),
              completed: s.completed === true,
              progress_version: parseProgressVersion(
                s.progress_version ?? progress_version,
              ),
              channel: input.channel,
              idempotency_key: key,
            },
          }
        }
      }
      return { kind: 'replay', result: replay }
    }

    const newVersion = progress_version + 1
    const newStatus: StudentTrailStatus = computed.completed
      ? 'completed'
      : computed.status === 'blocked'
        ? 'blocked'
        : 'in_progress'

    const patch: Record<string, unknown> = {
      current_stage_number: computed.next_stage_number,
      current_question_number: computed.next_question_number,
      status: newStatus,
      progress_version: newVersion,
      last_idempotency_key: key,
      last_channel: input.channel,
      last_advance_at: now,
      last_interaction_at: now,
      updated_at: now,
    }

    if (status === 'not_started' || !data.started_at) {
      patch.started_at = now
    }
    if (computed.completed) {
      patch.completed_at = now
    }

    if (input.mark_delivered) {
      patch.last_delivered = {
        stage_number: current_stage_number,
        question_number: current_question_number,
        content_fingerprint: contentFingerprint({
          trail_id: trailId,
          stage_number: current_stage_number,
          question_number: current_question_number,
        }),
      }
    }

    tx.update(ref, patch)

    const result: AdvanceResult = {
      status: 'ok',
      student_id: studentId,
      trail_id: trailId,
      next_stage_number: computed.next_stage_number,
      next_question_number: computed.next_question_number,
      completed: computed.completed,
      progress_version: newVersion,
      channel: input.channel,
      idempotency_key: key,
    }

    tx.set(
      idemRef,
      {
        student_id: studentId,
        trail_id: trailId,
        idempotency_key: key,
        effect,
        response_snapshot: result,
        created_at: now,
        expires_at: null,
      },
      { merge: true },
    )

    return { kind: 'ok', result }
  })

  if (txResult.kind === 'error') throw txResult.error
  return txResult.result
}

/**
 * Heartbeat sem +1 de posição (mark_last_interaction).
 */
export async function markInteraction(
  db: Firestore,
  input: {
    student_id: string
    trail_id: string
    channel?: TrailChannel
  },
  collections: CollectionNames = defaultCollectionNames(),
): Promise<{ ok: true }> {
  const docId = studentTrailDocId(input.student_id, input.trail_id)
  const ref = db.collection(collections.studentTrails).doc(docId)
  const now = FieldValue.serverTimestamp()

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      throw new TrailEngineError(
        'not_found',
        'Progresso da trilha não encontrado para este aluno.',
      )
    }
    const patch: Record<string, unknown> = {
      last_interaction_at: now,
      updated_at: now,
    }
    if (input.channel) patch.last_channel = input.channel
    tx.update(ref, patch)
  })

  return { ok: true }
}

/** Completa / bloqueia via motor (incrementa progress_version). */
export async function setProgressStatus(
  db: Firestore,
  input: {
    student_id: string
    trail_id: string
    status: 'completed' | 'blocked' | 'in_progress' | 'not_started'
    channel?: TrailChannel
    idempotency_key?: string
  },
  collections: CollectionNames = defaultCollectionNames(),
): Promise<{ ok: true; progress_version: number }> {
  const docId = studentTrailDocId(input.student_id, input.trail_id)
  const ref = db.collection(collections.studentTrails).doc(docId)
  const now = FieldValue.serverTimestamp()

  const version = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      throw new TrailEngineError(
        'not_found',
        'Progresso da trilha não encontrado para este aluno.',
      )
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>
    const progress_version = parseProgressVersion(data.progress_version) + 1
    const patch: Record<string, unknown> = {
      status: input.status,
      progress_version,
      updated_at: now,
      last_interaction_at: now,
    }
    if (input.channel) patch.last_channel = input.channel
    if (input.idempotency_key) {
      patch.last_idempotency_key = input.idempotency_key
    }
    if (input.status === 'in_progress' || input.status === 'completed') {
      if (!data.started_at) patch.started_at = now
    }
    if (input.status === 'completed') {
      patch.completed_at = now
      patch.last_advance_at = now
    }
    tx.update(ref, patch)
    return progress_version
  })

  return { ok: true, progress_version: version }
}
