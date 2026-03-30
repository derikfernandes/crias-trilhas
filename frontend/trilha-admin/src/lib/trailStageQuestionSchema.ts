import { z } from 'zod'

/**
 * Schema Zod alinhado à API `trail_stage_questions` (criação).
 * Útil em formulários admin; a validação definitiva permanece no servidor.
 */

export const trailStageQuestionOptionSchema = z.object({
  key: z.string().min(1, 'key obrigatória'),
  text: z.string().min(1, 'texto obrigatório'),
})

const baseFields = {
  trail_id: z.string().min(1, 'trail_id obrigatório'),
  stage_number: z.number().int().min(1),
  question_number: z.number().int().min(1),
  title: z.string().min(1, 'title obrigatório'),
  content: z.string().min(1, 'content obrigatório'),
  explanation: z.string().nullable().optional(),
}

const exerciseSchema = z
  .object({
    ...baseFields,
    question_type: z.literal('exercise'),
    correct_option: z.string().min(1, 'correct_option obrigatório em exercise'),
    options: z.array(trailStageQuestionOptionSchema).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const opts = data.options
    if (!opts || opts.length === 0) return
    const keys = new Set(opts.map((o) => o.key))
    if (keys.size !== opts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Chaves em options devem ser únicas',
      })
      return
    }
    if (!keys.has(data.correct_option)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correct_option deve ser uma das keys em options',
        path: ['correct_option'],
      })
    }
  })

export const trailStageQuestionCreateSchema = z.discriminatedUnion(
  'question_type',
  [
    z.object({
      ...baseFields,
      question_type: z.literal('ai'),
      correct_option: z.null(),
      options: z.null(),
    }),
    z.object({
      ...baseFields,
      question_type: z.literal('fixed'),
      correct_option: z.null(),
      options: z.null(),
    }),
    exerciseSchema,
  ],
)

export type TrailStageQuestionCreateInput = z.infer<
  typeof trailStageQuestionCreateSchema
>
