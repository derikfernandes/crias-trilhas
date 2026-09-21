/**
 * Shared Trail Engine — API pública (Wave A).
 * Independente de path HTTP; Chatis e app Trilha consomem as mesmas funções.
 */

export {
  advance,
  computeLegacyPrimitiveAdvance,
  computeSemanticAdvance,
  markInteraction,
  resolveIdempotencyDecision,
  setProgressStatus,
} from './advance'
export type { AdvanceInput } from './advance'

export { contentFingerprint } from './contentFingerprint'

export {
  additiveProgressDefaults,
  ensureEnrollment,
  getActiveEnrollment,
  getEnrollment,
  listEnrollmentsForStudent,
  questionDocId,
  requireEnrollment,
  snapshotToProgress,
  stageDocId,
  studentTrailDocId,
} from './enrollment'

export {
  isTrailEngineError,
  TrailEngineError,
  trailEngineErrorToJson,
} from './errors'
export type { TrailEngineErrorCode } from './errors'

export { decideNextAction, getNextContent } from './getNextContent'

export { getStatus } from './getStatus'

export {
  isValidCanonicalPhone,
  phoneLookupVariants,
  stripPhoneDigits,
  toCanonicalPhone,
} from './phoneNormalize'

export {
  recordDelivery,
  recordMessage,
  recordStudentMessage,
} from './recordMessage'
export type { RecordMessageInput, RecordMessageResult } from './recordMessage'

export {
  resolveStudentByPhone,
  resolveStudentByPhoneSoft,
} from './resolveStudent'

export { submitExerciseAnswer } from './submitExercise'
export type { SubmitExerciseInput, SubmitExerciseResult } from './submitExercise'

export type {
  AdvanceReason,
  AdvanceResult,
  CollectionNames,
  ComputedAdvance,
  LegacyPrimitive,
  NextAction,
  NextContentResult,
  ResolvedStudent,
  StageType,
  StudentTrailProgress,
  StudentTrailStatus,
  TrailChannel,
} from './types'
export { defaultCollectionNames } from './types'
