import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import { firebaseConfigError } from '../lib/firebase'
import { firebaseAuthErrorMessage } from '../lib/authErrors'

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from?.trim() || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="login">
        <p className="muted">Carregando…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setFormError('Informe seu e-mail.')
      return
    }
    if (!password) {
      setFormError('Informe sua senha.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      await signIn(trimmedEmail, password)
    } catch (err) {
      if (err instanceof FirebaseError) {
        setFormError(firebaseAuthErrorMessage(err.code))
      } else {
        setFormError(
          err instanceof Error ? err.message : 'Não foi possível entrar.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <header className="login__header">
          <Link to="/" className="login__brand">
            Crias Trilha
          </Link>
          <h1>Entrar</h1>
          <p className="login__lede muted">
            Acesse o painel administrativo com sua conta Firebase.
          </p>
        </header>

        {firebaseConfigError ? (
          <p className="banner banner--error" role="alert">
            {firebaseConfigError}
          </p>
        ) : (
          <form className="form login__form" onSubmit={handleSubmit}>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                required
              />
            </label>

            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </label>

            {formError ? (
              <p className="form__error banner banner--error" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="form__actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting}
              >
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        )}

        <p className="login__footer muted">
          <Link to="/doc">Documentação da API</Link>
        </p>
      </div>
    </div>
  )
}
