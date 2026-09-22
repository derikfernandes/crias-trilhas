import { describe, expect, it, vi } from 'vitest'

import {
  buildTrailAiPrompt,
  formatContextFromLogs,
} from '../buildTrailAiPrompt'
import { formatAiAnswer, TRAIL_AI_SPACING_RULES } from '../formatAiAnswer'
import { generateContentWithGemini } from '../geminiClient'

describe('formatAiAnswer (Chatis script 37)', () => {
  it('converte ||| em parágrafo sem espaços adjacentes', () => {
    expect(formatAiAnswer('*Título*|||Primeiro.|||Segundo.')).toBe(
      '*Título*\n\nPrimeiro.\n\nSegundo.',
    )
  })

  it('tolera espaços à volta do marcador', () => {
    expect(formatAiAnswer('A ||| B')).toBe('A\n\nB')
  })

  it('trata null/undefined', () => {
    expect(formatAiAnswer(null)).toBe('')
    expect(formatAiAnswer(undefined)).toBe('')
  })
})

describe('buildTrailAiPrompt', () => {
  it('inclui NAME, STUDENT_LEVEL, PROMPT, CONTENT, CONTEXT e regras |||', () => {
    const built = buildTrailAiPrompt({
      name: 'Ana',
      student_level: 2,
      prompt: 'Explica frações',
      content: 'Seed da questão',
      context: 'Sistema: Olá\nAluno: oi',
      trail_title: 'Matemática',
    })
    expect(built.systemInstruction).toContain(TRAIL_AI_SPACING_RULES.slice(0, 40))
    expect(built.systemInstruction).toContain('Matemática')
    expect(built.userText).toContain('NAME: Ana')
    expect(built.userText).toContain('STUDENT_LEVEL: 2')
    expect(built.userText).toContain('PROMPT: Explica frações')
    expect(built.userText).toContain('CONTENT: Seed da questão')
    expect(built.userText).toContain('Sistema: Olá')
  })

  it('formatContextFromLogs ordena e limita', () => {
    const text = formatContextFromLogs(
      [
        { sender: 'system', message_text: 'a', stage_number: 1, question_number: 1 },
        { sender: 'student', message_text: 'b', stage_number: 1, question_number: 1 },
      ],
      20,
    )
    expect(text).toContain('[S1 Q1] Sistema: a')
    expect(text).toContain('[S1 Q1] Aluno: b')
  })
})

describe('generateContentWithGemini', () => {
  it('usa GEMINI_API_KEY e devolve texto das candidates', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url)
      expect(href).toContain('generateContent')
      expect(href).toContain('key=test-key')
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '*Oi*|||Parágrafo.' }] } }],
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const result = await generateContentWithGemini(
      { systemInstruction: 'sys', userText: 'user' },
      {
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-2.0-flash',
      },
      fetchImpl,
    )
    expect(result.text).toContain('*Oi*')
    expect(result.model).toBe('gemini-2.0-flash')
  })

  it('falha sem credenciais', async () => {
    await expect(
      generateContentWithGemini(
        { systemInstruction: 's', userText: 'u' },
        {},
        vi.fn() as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/GEMINI_API_KEY/)
  })
})
