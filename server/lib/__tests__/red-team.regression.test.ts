/**
 * Ciclo 3 — regressão de segurança (PASS = seguro).
 * Inverso das provas do Red Team em cycle3-red-team-bb92.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isMutationMethod } from '../trail-engine/auth'
import {
  getStudentSessionSecret,
  issueStudentSessionToken,
} from '../studentAuth'

const ROOT = join(__dirname, '../..')

const KNOWN = new Set([
  'home',
  'next-content',
  'status',
  'advance',
  'submit-exercise',
])

function mutationRequiresServiceBearer(
  method: string,
  facade: string | null,
): boolean {
  const known = facade !== null && KNOWN.has(facade)
  return isMutationMethod(method) && !known
}

describe('RT-C1 regressão: allowlist facade', () => {
  it('facade inválido NÃO salta Bearer (legado ainda exige)', () => {
    expect(mutationRequiresServiceBearer('PUT', null)).toBe(true)
    expect(mutationRequiresServiceBearer('PUT', 'bogus')).toBe(true)
    expect(mutationRequiresServiceBearer('POST', 'not-a-facade')).toBe(true)
    expect(mutationRequiresServiceBearer('PUT', 'advance_stage')).toBe(true)
  })

  it('facade conhecida salta Bearer global (AuthZ via requireFacadeAuth)', () => {
    expect(mutationRequiresServiceBearer('POST', 'advance')).toBe(false)
    expect(mutationRequiresServiceBearer('GET', 'home')).toBe(false)
  })

  it('api/student_trails.ts usa KNOWN_FACADES / isKnownFacade', () => {
    const src = readFileSync(join(ROOT, '../api/student_trails.ts'), 'utf8')
    expect(src).toMatch(/KNOWN_FACADES/)
    expect(src).toMatch(/isKnownFacade/)
    expect(src).toMatch(/isMutationMethod\(request\.method\)\s*&&\s*!isKnownFacade/)
    expect(src).not.toMatch(
      /isMutationMethod\(request\.method\)\s*&&\s*!facade\b/,
    )
  })
})

describe('RT-H1 regressão: GET legado com AuthZ', () => {
  it('GET legado chama requireFacadeAuth', () => {
    const src = readFileSync(join(ROOT, '../api/student_trails.ts'), 'utf8')
    const getLegacyIdx = src.indexOf(
      '// GET /student_trails/\n    // GET /student_trails?id=',
    )
    expect(getLegacyIdx).toBeGreaterThan(-1)
    const slice = src.slice(getLegacyIdx, getLegacyIdx + 3500)
    expect(slice).toContain('requireFacadeAuth')
  })
})

describe('RT-M3 regressão: session secret fail-closed em prod', () => {
  it('produção sem STUDENT_SESSION_SECRET lança', () => {
    expect(() =>
      getStudentSessionSecret({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
      }),
    ).toThrow(/STUDENT_SESSION_SECRET/)
  })

  it('dev sem secret ainda permite lab (não prod)', () => {
    const s = getStudentSessionSecret({ NODE_ENV: 'development' })
    expect(s.length).toBeGreaterThan(8)
    expect(s).toContain('LAB-ONLY')
  })

  it('com secret explícito emite token', () => {
    const env = { STUDENT_SESSION_SECRET: 'unit-test-secret' }
    const { token } = issueStudentSessionToken(
      {
        student_id: 's1',
        institution_id: 'i1',
        name: 'A',
        phone_number: '5512974085258',
      },
      env,
    )
    expect(token.startsWith('v1.')).toBe(true)
  })
})

describe('RT-H3/H4: login uniforme sem OTP documentado', () => {
  it('trilha_auth uniformiza miss/inactivo e documenta residual sem OTP', () => {
    const src = readFileSync(join(ROOT, '../api/trilha_auth.ts'), 'utf8')
    expect(src).toMatch(/loginDenied|Não foi possível entrar com este telefone/)
    expect(src).toMatch(/sem OTP|RT-H4|U1/)
    expect(src).toMatch(/inactive_student/)
    expect(src).toMatch(/not_found/)
  })
})

describe('RT-C2: student_trails write negado no client', () => {
  it('firestore.rules: student_trails allow write: if false', () => {
    const rules = readFileSync(join(ROOT, '../firestore.rules'), 'utf8')
    expect(rules).toMatch(
      /match \/student_trails\/\{studentTrailId\}[\s\S]*?allow write: if false;/,
    )
  })
})

describe('FE não confia facade da URL do browser', () => {
  it('trilhaApi só usa literais TRILHA_KNOWN_FACADES', () => {
    const src = readFileSync(
      join(ROOT, '../frontend/trilha-admin/src/lib/trilha/trilhaApi.ts'),
      'utf8',
    )
    expect(src).toMatch(/TRILHA_KNOWN_FACADES/)
    expect(src).toMatch(/facadeQuery\(/)
    expect(src).not.toMatch(/searchParams\.get\(\s*['"]facade['"]\s*\)/)
  })
})
