import { describe, expect, it } from 'vitest'

import {
  aggregateAgentUsage,
  agentLabelForTrailId,
  brasiliaDateKey,
  CANONICAL_AGENT_TRAIL_IDS,
  isAgentTrailId,
  parsePeriodDays,
  periodCutoffMillis,
} from './agentUsage'

describe('isAgentTrailId', () => {
  it('classifica os trail_ids canônicos como agente', () => {
    for (const id of CANONICAL_AGENT_TRAIL_IDS) {
      expect(isAgentTrailId(id)).toBe(true)
    }
  })

  it('não classifica tN como agente', () => {
    expect(isAgentTrailId('t1')).toBe(false)
    expect(isAgentTrailId('t12')).toBe(false)
  })

  it('aceita prefixo Tutor - / Trilha - fora da allowlist', () => {
    expect(isAgentTrailId('Tutor - Extra')).toBe(true)
    expect(isAgentTrailId('Trilha - Geografia')).toBe(true)
  })

  it('ignora vazio', () => {
    expect(isAgentTrailId('')).toBe(false)
    expect(isAgentTrailId('   ')).toBe(false)
  })
})

describe('agentLabelForTrailId', () => {
  it('usa labels canônicos em PT', () => {
    expect(agentLabelForTrailId('Trilha - Matemática')).toBe('Matemática')
    expect(agentLabelForTrailId('Tutor - Linguagens')).toBe('Linguagens')
  })
})

describe('aggregateAgentUsage', () => {
  it('separa agentes de trilhas reais e agrega volume/alunos', () => {
    const result = aggregateAgentUsage(
      [
        { student_id: 's1', trail_id: 't1', at: 1_700_000_000_000 },
        {
          student_id: 's1',
          trail_id: 'Trilha - Matemática',
          at: 1_700_000_000_000,
        },
        {
          student_id: 's2',
          trail_id: 'Trilha - Matemática',
          at: 1_700_000_100_000,
        },
        {
          student_id: 's3',
          trail_id: 'Tutor - Linguagens',
          at: 1_700_000_200_000,
        },
      ],
      0,
    )

    // t1 é ignorado pelo classificador de agentes
    expect(result.total_messages).toBe(3)
    const math = result.agents.find((a) => a.trail_id === 'Trilha - Matemática')
    const ling = result.agents.find((a) => a.trail_id === 'Tutor - Linguagens')
    expect(math?.messages).toBe(2)
    expect(math?.unique_students).toBe(2)
    expect(ling?.messages).toBe(1)
    expect(math?.pct_of_total).toBe(66.7)
    // allowlist completa presente
    expect(result.agents).toHaveLength(CANONICAL_AGENT_TRAIL_IDS.length)
    expect(result.agents.every((a) => a.label.length > 0)).toBe(true)
  })

  it('inclui agentes por prefixo além da allowlist', () => {
    const result = aggregateAgentUsage([
      { student_id: 's1', trail_id: 'Tutor - Extra', at: 1_700_000_000_000 },
    ])
    expect(result.agents.some((a) => a.trail_id === 'Tutor - Extra')).toBe(true)
    expect(result.total_messages).toBe(1)
  })

  it('gera série diária', () => {
    const at = Date.parse('2026-09-18T15:00:00-03:00')
    const result = aggregateAgentUsage([
      { student_id: 's1', trail_id: 'Trilha - Geral', at },
      { student_id: 's1', trail_id: 'Trilha - Geral', at: at + 1000 },
    ])
    expect(result.series.length).toBeGreaterThan(0)
    expect(result.series[0]?.messages).toBe(2)
    expect(brasiliaDateKey(at)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('parsePeriodDays / periodCutoffMillis', () => {
  it('aceita 7 e 30; demais viram 0', () => {
    expect(parsePeriodDays('7')).toBe(7)
    expect(parsePeriodDays('30')).toBe(30)
    expect(parsePeriodDays('0')).toBe(0)
    expect(parsePeriodDays('9')).toBe(0)
    expect(parsePeriodDays(null)).toBe(0)
  })

  it('cutoff é 0 quando período é todo', () => {
    expect(periodCutoffMillis(0, 1_000_000)).toBe(0)
    expect(periodCutoffMillis(7, 7 * 24 * 60 * 60 * 1000)).toBe(0)
  })
})
