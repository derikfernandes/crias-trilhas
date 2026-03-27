import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { db, firebaseConfigError } from './lib/firebase'
import { PRODUCTION_APP_ORIGIN } from './lib/site'
import { DocPage } from './pages/DocPage'
import { HomePage } from './pages/HomePage'
import { InstitutionDetailPage } from './pages/InstitutionDetailPage'
import { InstitutionNewPage } from './pages/InstitutionNewPage'
import { TrailDetailPage } from './pages/TrailDetailPage'
import { TrailNewPage } from './pages/TrailNewPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentNewPage } from './pages/StudentNewPage'
import './App.css'

const routerBasename =
  import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

const firebaseOk = !firebaseConfigError && db

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="admin">
      <nav className="nav">
        <Link to="/" className="nav__brand">
          Crias Trilha
        </Link>
        <div className="nav__links">
          <Link to="/">Início</Link>
          {firebaseOk ? (
            <Link to="/instituicoes/novo">Nova instituição</Link>
          ) : null}
          {firebaseOk ? <Link to="/alunos/novo">Novo aluno</Link> : null}
          {firebaseOk ? <Link to="/trilhas/novo">Nova trilha</Link> : null}
          <Link to="/doc">API / Doc</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}

function FirebaseGate({ children }: { children: ReactNode }) {
  if (!firebaseOk) {
    return (
      <>
        <header className="admin__header">
          <h1>Instituições</h1>
        </header>
        <p className="banner banner--error" role="alert">
          {firebaseConfigError ??
            'Firebase não inicializado. Configure VITE_FIREBASE_* no .env local ou nas Environment Variables da Vercel.'}
        </p>
        <p className="admin__lede muted">
          App em produção:{' '}
          <a href={PRODUCTION_APP_ORIGIN} target="_blank" rel="noreferrer">
            {PRODUCTION_APP_ORIGIN}
          </a>
          . Documentação da API em <Link to="/doc">/doc</Link>.
        </p>
      </>
    )
  }
  return children
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <Layout>
        <Routes>
          <Route path="/doc" element={<DocPage />} />
          <Route
            path="/"
            element={
              <FirebaseGate>
                <HomePage />
              </FirebaseGate>
            }
          />
          <Route
            path="/instituicoes/novo"
            element={
              <FirebaseGate>
                <InstitutionNewPage />
              </FirebaseGate>
            }
          />
          <Route
            path="/instituicoes/:id"
            element={
              <FirebaseGate>
                <InstitutionDetailPage />
              </FirebaseGate>
            }
          />
          <Route
            path="/alunos/novo"
            element={
              <FirebaseGate>
                <StudentNewPage />
              </FirebaseGate>
            }
          />
          <Route
            path="/alunos/:id"
            element={
              <FirebaseGate>
                <StudentDetailPage />
              </FirebaseGate>
            }
          />
          <Route
            path="/trilhas/novo"
            element={
              <FirebaseGate>
                <TrailNewPage />
              </FirebaseGate>
            }
          />
          <Route
            path="/trilhas/:id"
            element={
              <FirebaseGate>
                <TrailDetailPage />
              </FirebaseGate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
