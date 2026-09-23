export { buildTrailAiPrompt, formatContextFromLogs } from './buildTrailAiPrompt'
export type { BuiltTrailAiPrompt, TrailAiPromptInput } from './buildTrailAiPrompt'
export { ensureTrailAiContent } from './ensureTrailAiContent'
export type { EnsureTrailAiResult } from './ensureTrailAiContent'
export {
  formatAiAnswer,
  TRAIL_AI_SPACING_RULES,
} from './formatAiAnswer'
export {
  buildVertexGenerateContentUrl,
  generateContentWithGemini,
  GOOGLE_OAUTH_SCOPES,
  isTrailAiDisabled,
  resolveGeminiModel,
  resolveTrailAiModel,
  resolveVertexTarget,
} from './geminiClient'
export {
  listRecentContextLogs,
  resolveDeliveredAiContent,
} from './resolveDeliveredAiContent'
