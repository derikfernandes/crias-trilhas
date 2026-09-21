/**
 * Ciclo 3 Red Team — provas automatizadas das falhas encontradas.
 *
 * Estes testes DOCUMENTAM comportamento inseguro actual (passam enquanto o bug
 * existir). Quando o fix aterrar, inverter as asserções / mover para regressão.
 *
 * Ver: internal/cycle3-red-team.md
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

/** Espelho do gate vulnerável em api/student_trails.ts */
function legacyMutationSkipsBearerWhenFacadePresent(
  method: string,
  facade: string | null,
): boolean {
  return isMutationMethod(method) && !facade
}

describe('RT-C1 CRITICAL: ?facade=bogus bypassa assertServiceBearer', () => {
  it('gate actual: qualquer facade truthy salta Bearer (incl. valor inválido)', () => {
    // Sem facade → exigiria Bearer
    expect(legacyMutationSkipsBearerWhenFacadePresent('PUT', null)).toBe(true)
    expect(legacyMutationSkipsBearerWhenFacadePresent('POST', null)).toBe(true)

    // Attack: facade lixo → gate NÃO exige Bearer; handler cai no PUT/POST legado
    expect(legacyMutationSkipsBearerWhenFacadePresent('PUT', 'bogus')).toBe(
      false,
    )
    expect(
      legacyMutationSkipsBearerWhenFacadePresent('POST', 'not-a-facade'),
    ).toBe(false)
    expect(
      legacyMutationSkipsBearerWhenFacadePresent('PUT', 'advance_stage'),
    ).toBe(false)
  })

  it('fonte: api/student_trails.ts usa !facade em vez de whitelist', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    expect(src).toMatch(
      /isMutationMethod\(request\.method\)\s*&&\s*!facade/,
    )
    // Ausência de allowlist de facades conhecidas no gate de mutação
    expect(src).not.toMatch(
      /FACADES|KNOWN_FACADES|ALLOWED_FACADES|isKnownFacade/,
    )
  })
})

describe('RT-H1 HIGH: GET legado student_trails sem AuthZ', () => {
  it('GET posição/por-id não chama requireFacadeAuth / resolveAuthPrincipal', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    // Bloco GET legado (após facades): lê por id / student_id+trail_id
    const getLegacyIdx = src.indexOf(
      '// GET /student_trails/\n    // GET /student_trails?id=',
    )
    expect(getLegacyIdx).toBeGreaterThan(-1)
    const slice = src.slice(getLegacyIdx, getLegacyIdx + 2500)
    expect(slice).toContain('getStudentTrailByComposite')
    expect(slice).not.toContain('requireFacadeAuth')
    expect(slice).not.toContain('assertServiceBearer')
  })
})

describe('RT-H2 HIGH: APIs satélite sem auth (exercise/logs/student list)', () => {
  it('exercise_attempts e conversation_logs não têm gate Bearer/AuthZ', () => {
    for (const file of ['api/exercise_attempts.ts', 'api/conversation_logs.ts']) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src).not.toMatch(/assertServiceBearer|requireFacadeAuth|authorizeStudentResource/)
    }
  })

  it('GET /api/student lista todos sem Authorization', () => {
    const src = readFileSync(join(ROOT, 'api/student.ts'), 'utf8')
    expect(src).toContain('db.collection(collection).get()')
    expect(src).not.toMatch(/assertServiceBearer|authorizeStudentResource/)
  })
})

describe('RT-H3 HIGH: enumeração telefone + leak student_id inactivo', () => {
  it('inactive_student inclui student_id em details (oráculo)', () => {
    const src = readFileSync(
      join(ROOT, 'server/lib/trail-engine/resolveStudent.ts'),
      'utf8',
    )
    expect(src).toMatch(
      /inactive_student[\s\S]{0,200}student_id:\s*picked\.id/,
    )
  })

  it('not_found=404 vs inactive=409 — códigos distintos permitem enum', () => {
    const nf = new TrailEngineError('not_found', 'miss')
    const ina = new TrailEngineError('inactive_student', 'off', {
      student_id: 's99',
    })
    expect(nf.httpStatus).toBe(404)
    expect(ina.httpStatus).toBe(409)
    expect(ina.details?.student_id).toBe('s99')
  })
})

describe('RT-H4 HIGH: firestore.rules abertas (Client SDK bypass motor)', () => {
  it('students/logs/attempts allow write: if true; student_trails só signedIn()', () => {
    const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8')
    expect(rules).toMatch(
      /match \/students\/\{studentId\}[\s\S]*?allow read, write: if true;/,
    )
    expect(rules).toMatch(
      /match \/conversation_logs\/\{logId\}[\s\S]*?allow read, write: if true;/,
    )
    expect(rules).toMatch(
      /match \/exercise_attempts\/\{attemptId\}[\s\S]*?allow read, write: if true;/,
    )
    // Qualquer Firebase Auth (não só o sN dono) pode escrever progresso
    expect(rules).toMatch(
      /match \/student_trails\/\{studentTrailId\}[\s\S]*?allow read, write: if signedIn\(\);/,
    )
    expect(rules).not.toMatch(/request\.auth\.uid ==|student_id ==/)
  })
})

describe('RT-M1 MED: duas Idempotency-Keys distintas → double advance (I7)', () => {
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

describe('RT-M2 MED: canal spoof admin via fachada aluno', () => {
  it('API aceita body.channel=admin (parseChannel) sem restringir ao principal', () => {
    const src = readFileSync(join(ROOT, 'api/student_trails.ts'), 'utf8')
    // advance facade: parseChannel(body.channel) sem checagem service-only
    expect(src).toMatch(
      /facade === 'advance'[\s\S]*?parseChannel\(body\.channel\)/,
    )
    expect(src).toContain("v === 'whatsapp' || v === 'app' || v === 'admin'")
  })
})

describe('RT-M3 MED: secret de sessão com fallback previsível', () => {
  it('sem env → secret literal de dev', () => {
    const secret = getStudentSessionSecret({} as NodeJS.ProcessEnv)
    expect(secret).toBe('crias-dev-student-session-secret')
  })

  it('com secret conhecido, forja token e AuthZ no próprio sN', () => {
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

describe('RT-L1 LOW: parser Chatis / IR ausente (I5)', () => {
  it('não existe packages/chatis-flow nem parseChatisExport', () => {
    const src = readFileSync(join(ROOT, 'package.json'), 'utf8')
    expect(src).not.toMatch(/chatis-flow|parseChatis/)
    // Plano Wave C ainda não aterrado neste branch
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
