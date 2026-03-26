import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { INSTITUTIONS_COLLECTION } from '../lib/institutionFirestore'
import { STUDENTS_COLLECTION } from '../lib/studentFirestore'
import { studentPath } from '../lib/paths'
import type { Student } from '../types/student'

type Props = {
  /** Se ausente, modo criação. */
  docId?: string
  /** Dados atuais (modo edição); o pai mantém o listener do Firestore. */
  initial?: Student
}

const FUNDAMENTAL_GRADES = [
  '1º ano',
  '2º ano',
  '3º ano',
  '4º ano',
  '5º ano',
  '6º ano',
  '7º ano',
  '8º ano',
  '9º ano',
]

const MIDDLE_GRADES = ['1º ano', '2º ano', '3º ano']

function sanitizePhoneNumber(v: string): string {
  // Remove tudo que não for dígito (deixa o telefone "limpo").
  return v.replace(/\D/g, '')
}

function normalizeSchoolLevel(v: string): Student['school_level'] {
  const s = v.trim().toLowerCase()
  if (s === 'fundamental') return 'fundamental'
  if (s === 'medio' || s === 'médio') return 'médio'
  return v
}

export function StudentForm({ docId, initial }: Props) {
  const navigate = useNavigate()
  const isEdit = Boolean(docId)

  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([])

  const [institution_id, setInstitutionId] = useState('')
  const [name, setName] = useState('')
  const [phone_number, setPhoneNumber] = useState('')
  const [school_level, setSchoolLevel] = useState<Student['school_level']>(
    'fundamental',
  )
  const [school_grade, setSchoolGrade] = useState('')
  const [student_level, setStudentLevel] = useState<1 | 2 | 3>(2)
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // Carrega instituições apenas para montar o select de vínculo.
    if (!db) return
    const unsub = onSnapshot(
      collection(db, INSTITUTIONS_COLLECTION),
      (snap) => {
        const next = snap.docs.map((d) => {
          const data = d.data()
          const nm = typeof (data as Record<string, unknown>).name === 'string'
            ? ((data as Record<string, unknown>).name as string)
            : ''
          return { id: d.id, name: nm }
        })
        next.sort((a, b) => a.name.localeCompare(b.name))
        setInstitutions(next)
      },
      () => {
        // Se falhar, deixa lista vazia (a validação bloqueia submit).
        setInstitutions([])
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isEdit) {
      setName('')
      setPhoneNumber('')
      setInstitutionId('')
      setSchoolLevel('fundamental')
      setSchoolGrade(FUNDAMENTAL_GRADES[0])
      setStudentLevel(2)
      setActive(true)
      return
    }

    if (!initial) return
    setInstitutionId(initial.institution_id)
    setName(initial.name)
    setPhoneNumber(sanitizePhoneNumber(initial.phone_number))
    setSchoolLevel(normalizeSchoolLevel(initial.school_level))
    setSchoolGrade(initial.school_grade)
    setStudentLevel(initial.student_level)
    setActive(initial.active)
  }, [isEdit, initial])

  const gradesForLevel = useMemo(() => {
    return school_level === 'médio' ? MIDDLE_GRADES : FUNDAMENTAL_GRADES
  }, [school_level])

  useEffect(() => {
    // Se o usuário trocar o nível escolar, ajusta a série/ano para uma opção válida.
    if (!school_grade) {
      setSchoolGrade(gradesForLevel[0] ?? '')
      return
    }
    if (!gradesForLevel.includes(school_grade)) {
      setSchoolGrade(gradesForLevel[0] ?? '')
    }
  }, [gradesForLevel, school_grade])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) return

    const instId = institution_id.trim()
    const trimmedName = name.trim()
    const trimmedPhone = sanitizePhoneNumber(phone_number).trim()
    const normalizedLevel = normalizeSchoolLevel(String(school_level))
    const normalizedStudentLevel = student_level

    if (!instId) {
      setFormError('Informe a instituição (vínculo obrigatório).')
      return
    }
    if (!trimmedName) {
      setFormError('Informe o nome do aluno.')
      return
    }
    if (!trimmedPhone) {
      setFormError('Informe o telefone do aluno.')
      return
    }
    if (normalizedLevel !== 'fundamental' && normalizedLevel !== 'médio') {
      setFormError('school_level deve ser "fundamental" ou "médio".')
      return
    }
    if (!school_grade) {
      setFormError('Informe a série/ano (school_grade).')
      return
    }
    if (![1, 2, 3].includes(normalizedStudentLevel)) {
      setFormError('student_level deve ser 1, 2 ou 3.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (docId) {
        await updateDoc(doc(db, STUDENTS_COLLECTION, docId), {
          institution_id: instId,
          name: trimmedName,
          phone_number: trimmedPhone,
          school_level: normalizedLevel,
          school_grade,
          student_level: normalizedStudentLevel,
          active,
          updated_at: serverTimestamp(),
        })
      } else {
        const ref = await addDoc(collection(db, STUDENTS_COLLECTION), {
          institution_id: instId,
          name: trimmedName,
          phone_number: trimmedPhone,
          school_level: normalizedLevel,
          school_grade,
          student_level: normalizedStudentLevel,
          active,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
        navigate(studentPath(ref.id))
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!db || !docId || !initial) return
    const ok = window.confirm(
      `Excluir o aluno "${initial.name || docId}"? Esta ação não pode ser desfeita.`,
    )
    if (!ok) return

    try {
      await deleteDoc(doc(db, STUDENTS_COLLECTION, docId))
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  return (
    <section className="panel">
      <h2>{isEdit ? 'Editar aluno' : 'Novo aluno'}</h2>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Instituição</span>
          <select
            value={institution_id}
            onChange={(e) => setInstitutionId(e.target.value)}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name ? `${inst.name} (${inst.id})` : inst.id}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: João da Silva"
            autoComplete="name"
          />
        </label>

        <label className="field">
          <span>Telefone</span>
          <input
            type="text"
            value={phone_number}
            onChange={(e) =>
              setPhoneNumber(sanitizePhoneNumber(e.target.value))
            }
            placeholder="+55 11 99999-0000"
            autoComplete="tel"
          />
        </label>

        <label className="field">
          <span>Nível escolar (school_level)</span>
          <select
            value={school_level}
            onChange={(e) => setSchoolLevel(normalizeSchoolLevel(e.target.value))}
          >
            <option value="fundamental">fundamental</option>
            <option value="médio">médio</option>
          </select>
        </label>

        <label className="field">
          <span>Série/ano (school_grade)</span>
          <select
            value={school_grade}
            onChange={(e) => setSchoolGrade(e.target.value)}
          >
            {gradesForLevel.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Nível do aluno (student_level)</span>
          <select
            value={student_level}
            onChange={(e) => setStudentLevel(Number(e.target.value) as 1 | 2 | 3)}
          >
            <option value={1}>1</option>
            <option value={2}>2 (intermediário)</option>
            <option value={3}>3</option>
          </select>
        </label>

        <label className="field field--inline">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Aluno ativo</span>
        </label>

        {formError ? (
          <p className="form__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Incluir'}
          </button>
          {isEdit ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleDelete}
              disabled={saving}
            >
              Excluir
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}

