/**
 * Ciclo 3 Red Team — provas pós-fix (PASS = seguro / fix presente).
 *
 * Invertido face a PR #49 (onde PASS = bug). Se alguém reverter o harden
 * de d73b4e3, estes testes FALHAM.
 *
 * Resíduos High/Med ainda abertos estão em describe `RESIDUAL OPEN`
 * (PASS enquanto o buraco existir — documentam dívida conhecida).
 *
 * Ver: internal/cycle3-red-team.md · internal/cycle3-red-team-reqa.md
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { advance } from '../advance'
import { isMutationMethod } from '../auth'
import { TrailEngineError } from '../errors'
import {
  authorizeStudentResource,
  getStudentSessionSecret,
  issueStudentSessionToken,
  resolveAuthPrincipal,
} from '../../studentAuth'
import { createMemoryFirestore } from './memoryFirestore'

const ROOT = join(__dirname, '../../../..')

const COLLECTIONS = {
  students: 'students',
  trails: 'trails',
  studentTrails: 'student_trails',
  trailStages: 'trail_stages',
  trailStageQuestions: 'trail_stage_questions',
  conversationLogs: 'conversation_logs',
  exerciseAttempts: 'exercise_attempts',
  idempotencyKeys: 'idempotency_keys',
}

const KNOWN_FACADES = new Set([
  'home',
  'next-content',
  'status',
  'advance',
  'submit-exercise',
])

/** Espelho do gate CORRIGIDO (RT-C1): só facade conhecida salta Bearer global. */
function mutationRequiresServiceBearer(
  method: string,
  facade: string | null,
): boolean {
  const known = facade !== null && KNOWN_FACADES.has(facade)
  return isMutationMethod(method) && !known
}

describe('RT-C1 CRITICAL FIX: allowlist facade — bogus NÃO salta Bearer', () => {
  it('facade inválido / ausente em mutação ainda exige Bearer', () => {
    expect(mutationRequiresServiceBearer('PUT', null)).toBe(true)
    expect(mutationRequiresServiceBearer('POST', null)).toBe(true)
    expect(mutationRequiresServiceBearer('PUT', 'bogus')).toBe(true)
    expect(mutationRequiresServiceBearer('POST', 'not-a-facade')).toBe(true)
    expect(mutationRequiresServiceBearer('PUT', 'advance_stage')).toBe(true)
  })

  it('facade conhecida (advance) salta Bearer global (AuthZ via requireFacadeAuth)', () => {
    expect(mutationRequiresServiceBearer('POST', 'advance')).toBe(false)
    expect(mutationRequiresServiceBearer('GET', 'home')).toBe(false)
  })

  it('fonte: api/student_trails.ts usa KNOWN_FACADES / isKnownFacade (não !facade)', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    expect(src).toMatch(/KNOWN_FACADES/)
    expect(src).toMatch(/isKnownFacade/)
    expect(src).toMatch(
      /isMutationMethod\(request\.method\)\s*&&\s*!isKnownFacade/,
    )
    expect(src).not.toMatch(
      /isMutationMethod\(request\.method\)\s*&&\s*!facade\b/,
    )
    expect(src).toMatch(/invalid_facade/)
  })
})

describe('RT-C2 CRITICAL FIX: student_trails write negado no Client SDK', () => {
  it('firestore.rules: progresso allow write: if false (ADR-008)', () => {
    const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8')
    const block = rules.match(
      /match \/student_trails\/\{studentTrailId\} \{[\s\S]*?\n    \}/,
    )?.[0]
    expect(block).toBeTruthy()
    expect(block!).toMatch(/allow write: if false;/)
    expect(block!).not.toMatch(/allow write: if signedIn\(\)/)
    expect(block!).not.toMatch(/allow read, write:/)
  })

  it('students/logs/attempts já não são allow write: if true (anon fechado)', () => {
    const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8')
    for (const re of [
      /match \/students\/\{studentId\} \{[\s\S]*?\n    \}/,
      /match \/conversation_logs\/\{logId\} \{[\s\S]*?\n    \}/,
      /match \/exercise_attempts\/\{attemptId\} \{[\s\S]*?\n    \}/,
    ]) {
      const block = rules.match(re)?.[0]
      expect(block).toBeTruthy()
      expect(block!).not.toMatch(/if true/)
      expect(block!).toMatch(/signedIn\(\)/)
    }
  })
})

describe('RT-H1 HIGH FIX: GET legado student_trails com AuthZ', () => {
  it('GET posição/por-id chama requireFacadeAuth', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    const getLegacyIdx = src.indexOf(
      '// GET /student_trails/\n    // GET /student_trails?id=',
    )
    expect(getLegacyIdx).toBeGreaterThan(-1)
    const slice = src.slice(getLegacyIdx, getLegacyIdx + 3500)
    expect(slice).toContain('getStudentTrailByComposite')
    expect(slice).toContain('requireFacadeAuth')
  })
})

describe('RT-M2 MED FIX: canal aluno forçado a app', () => {
  it('resolveMutationChannel presente; advance usa channel resolvido', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    expect(src).toMatch(/function resolveMutationChannel/)
    expect(src).toMatch(
      /facade === 'advance'[\s\S]*?resolveMutationChannel\(request,\s*requestedChannel\)/,
    )
    expect(src).toMatch(/principal\.kind === 'student'\) return 'app'/)
  })
})

describe('RT-M3 MED FIX: session secret fail-closed em produção', () => {
  it('produção sem STUDENT_SESSION_SECRET lança', () => {
    expect(() =>
      getStudentSessionSecret({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
      }),
    ).toThrow(/STUDENT_SESSION_SECRET/)
  })

  it('dev sem secret usa lab marcado (não o literal antigo sozinho)', () => {
    const secret = getStudentSessionSecret({ NODE_ENV: 'development' })
    expect(secret).toContain('LAB-ONLY')
    expect(secret).not.toBe('crias-dev-student-session-secret')
  })

  it('com secret conhecido, forja token e AuthZ no próprio sN (esperado)', () => {
    const env = {
      STUDENT_SESSION_SECRET: 'red-team-known-secret',
    } as NodeJS.ProcessEnv
    const { token } = issueStudentSessionToken(
      {
        student_id: 'sVictim',
        institution_id: 'i1',
        name: 'Forged',
        phone_number: '5511999999999',
      },
      env,
    )
    const principal = resolveAuthPrincipal(`Bearer ${token}`, env)
    expect(principal.kind).toBe('student')
    expect(authorizeStudentResource(principal, 'sVictim')).toEqual({ ok: true })
    expect(authorizeStudentResource(principal, 'sOther').ok).toBe(false)
  })
})

describe('RT-H3 PARTIAL FIX: login trilha_auth uniforme (sem oráculo 404/409)', () => {
  it('trilha_auth uniformiza miss/inactivo → 401 genérico', () => {
    const src = readFileSync(join(ROOT, 'api/trilha_auth.ts'), 'utf8')
    expect(src).toMatch(/loginDenied|Não foi possível entrar com este telefone/)
    expect(src).toMatch(/inactive_student/)
    expect(src).toMatch(/not_found/)
  })
})

/* -------------------------------------------------------------------------- */
/* RESIDUAL OPEN — documentam buracos ainda presentes (PASS = buraco existe)  */
/* -------------------------------------------------------------------------- */

describe('RESIDUAL OPEN RT-H2: APIs satélite sem auth (exercise/logs/student list)', () => {
  it('exercise_attempts e conversation_logs ainda sem gate Bearer/AuthZ', () => {
    for (const file of [
      'api/exercise_attempts.ts',
      'api/conversation_logs.ts',
    ]) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src).not.toMatch(
        /assertServiceBearer|requireFacadeAuth|authorizeStudentResource/,
      )
    }
  })

  it('GET /api/student lista todos sem Authorization', () => {
    const src = readFileSync(join(ROOT, 'api/student.ts'), 'utf8')
    expect(src).toContain('db.collection(collection).get()')
    expect(src).not.toMatch(/assertServiceBearer|authorizeStudentResource/)
  })
})

describe('RESIDUAL OPEN RT-H3 engine: resolveStudent ainda embute student_id em inactive', () => {
  it('inactive_student inclui student_id em details (oráculo residual no motor)', () => {
    const src = readFileSync(
      join(ROOT, 'server/lib/trail-engine/resolveStudent.ts'),
      'utf8',
    )
    expect(src).toMatch(
      /inactive_student[\s\S]{0,200}student_id:\s*picked\.id/,
    )
  })

  it('códigos de erro do motor ainda distintos (404 vs 409) — callers não-trilha_auth', () => {
    const nf = new TrailEngineError('not_found', 'miss')
    const ina = new TrailEngineError('inactive_student', 'off', {
      student_id: 's99',
    })
    expect(nf.httpStatus).toBe(404)
    expect(ina.httpStatus).toBe(409)
    expect(ina.details?.student_id).toBe('s99')
  })
})

describe('RESIDUAL OPEN RT-H4 U1: login telefone sem OTP', () => {
  it('trilha_auth documenta ausência de OTP (risco aceite v1)', () => {
    const src = readFileSync(join(ROOT, 'api/trilha_auth.ts'), 'utf8')
    expect(src).toMatch(/sem OTP|RT-H4|U1/)
  })
})

describe('RESIDUAL OPEN RT-C2 satellite: logs/attempts write se signedIn (não dono)', () => {
  it('conversation_logs / exercise_attempts ainda allow write se signedIn()', () => {
    const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8')
    for (const re of [
      /match \/conversation_logs\/\{logId\} \{[\s\S]*?\n    \}/,
      /match \/exercise_attempts\/\{attemptId\} \{[\s\S]*?\n    \}/,
    ]) {
      const block = rules.match(re)?.[0]
      expect(block).toBeTruthy()
      expect(block!).toMatch(/allow read, write: if signedIn\(\);/)
    }
  })
})

describe('RESIDUAL OPEN RT-M1: duas Idempotency-Keys → double advance (I7)', () => {
  let mem: ReturnType<typeof createMemoryFirestore>

  beforeEach(() => {
    mem = createMemoryFirestore()
    mem.seed('trails', 't1', {
      institution_id: 'i1',
      default_total_steps_per_stage: 8,
    })
    mem.seed('trail_stage_questions', 't1_stage_1_q_10', {
      trail_id: 't1',
      stage_number: 1,
      question_number: 10,
    })
    mem.seed('student_trails', 's1_trail_t1', {
      student_id: 's1',
      institution_id: 'i1',
      trail_id: 't1',
      current_stage_number: 2,
      current_question_number: 1,
      status: 'in_progress',
      progress_version: 0,
      last_idempotency_key: null,
    })
  })

  it('double-tap com UUIDs diferentes (sem expected_version) avança 2×', async () => {
    const a = await advance(
      mem.db,
      {
        student_id: 's1',
        trail_id: 't1',
        idempotency_key: 'app:s1:t1:advance:2:1:uuid-A',
        channel: 'app',
        reason: 'delivered',
      },
      COLLECTIONS,
    )
    const b = await advance(
      mem.db,
      {
        student_id: 's1',
        trail_id: 't1',
        idempotency_key: 'app:s1:t1:advance:2:1:uuid-B',
        channel: 'app',
        reason: 'delivered',
      },
      COLLECTIONS,
    )
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(a.next_stage_number).toBe(3)
    expect(b.next_stage_number).toBe(4)
    expect(mem.getData('student_trails', 's1_trail_t1')?.progress_version).toBe(
      2,
    )
  })

  it('expected_version no 2º pedido bloqueia o double-tap (mitigação FE)', async () => {
    await advance(
      mem.db,
      {
        student_id: 's1',
        trail_id: 't1',
        idempotency_key: 'app:s1:t1:advance:2:1:uuid-A',
        channel: 'app',
        reason: 'delivered',
        expected_version: 0,
      },
      COLLECTIONS,
    )
    await expect(
      advance(
        mem.db,
        {
          student_id: 's1',
          trail_id: 't1',
          idempotency_key: 'app:s1:t1:advance:2:1:uuid-B',
          channel: 'app',
          reason: 'delivered',
          expected_version: 0,
        },
        COLLECTIONS,
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('RESIDUAL OPEN RT-M4: update_position sem bounds vs totais da trilha', () => {
  it('PUT update_position aceita stage/question sem validar teto da trilha', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    const idx = src.indexOf("if (action === 'update_position')")
    expect(idx).toBeGreaterThan(-1)
    const slice = src.slice(idx, idx + 1200)
    expect(slice).toMatch(/parsedStage|current_stage_number/)
    expect(slice).not.toMatch(/total_stages|max_stage|bounds|ceil/)
  })
})

describe('RESIDUAL OPEN RT-M5 / L1: parser Chatis / IR ausente (I5)', () => {
  it('não existe packages/chatis-flow nem parseChatisExport', () => {
    const src = readFileSync(join(ROOT, 'package.json'), 'utf8')
    expect(src).not.toMatch(/chatis-flow|parseChatis/)
    let missing = false
    try {
      readFileSync(
        join(ROOT, 'server/lib/chatis-flow/parseChatisExport.ts'),
        'utf8',
      )
    } catch {
      missing = true
    }
    expect(missing).toBe(true)
  })
})
