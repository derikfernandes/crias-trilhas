import type { ReactNode } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import { usePermissions } from './hooks/usePermissions'
import { NAV_ITEMS, navPermissionForPath } from './lib/adminPermissions'
import { db, firebaseConfigError } from './lib/firebase'
import { PRODUCTION_APP_ORIGIN } from './lib/site'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { DocPage } from './pages/DocPage'
import { GabaritoPage } from './pages/GabaritoPage'
import { HomePage } from './pages/HomePage'
import { InstitutionDetailPage } from './pages/InstitutionDetailPage'
import { InstitutionNewPage } from './pages/InstitutionNewPage'
import { LoginPage } from './pages/LoginPage'
import { TrailDetailPage } from './pages/TrailDetailPage'
import { TrailStageQuestionsPage } from './pages/TrailStageQuestionsPage'
import { TrailNewPage } from './pages/TrailNewPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentNewPage } from './pages/StudentNewPage'
import { GerenciamentoPage } from './pages/GerenciamentoPage'
import './App.css'

const routerBasename =
  import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

const firebaseOk = !firebaseConfigError && db

function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { canNav, permissionsLoading } = usePermissions()
  const authed = Boolean(user)

  return (
    <div className="admin">
      <nav className="nav">
        <Link to="/" className="nav__brand">
          Crias Trilha
        </Link>
        <div className="nav__links">
          {authed ? (
            <>
              {permissionsLoading ? (
                <span className="muted">Carregando menu…</span>
              ) : (
                NAV_ITEMS.filter((item) => canNav(item.key)).map((item) => (
                  <Link key={item.key} to={item.path}>
                    {item.label}
                  </Link>
                ))
              )}
              <span className="nav__user muted">{user?.email}</span>
              <button
                type="button"
                className="nav__logout btn btn--ghost btn--small"
                onClick={() => void signOut()}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/doc">API / Doc</Link>
              <Link to="/login">Entrar</Link>
            </>
          )}
        </div>
      </nav>
      {children}
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, adminProfile } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="muted">Carregando…</p>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (adminProfile && !adminProfile.active) {
    return (
      <p className="banner banner--error" role="alert">
        Sua conta está desativada. Fale com um administrador.
      </p>
    )
  }

  return children
}

function RequireNavPermission({ children }: { children: ReactNode }) {
  const { canNav, permissionsLoading } = usePermissions()
  const location = useLocation()
  const required = navPermissionForPath(location.pathname)

  if (permissionsLoading) {
    return <p className="muted">Carregando permissões…</p>
  }

  if (!canNav(required)) {
    return (
      <p className="banner banner--error" role="alert">
        Você não tem permissão para acessar esta página.
      </p>
    )
  }

  return children
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

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireNavPermission>
        <FirebaseGate>{children}</FirebaseGate>
      </RequireNavPermission>
    </RequireAuth>
  )
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/doc" element={<DocPage />} />
        <Route
          path="/"
          element={
            <ProtectedPage>
              <HomePage />
            </ProtectedPage>
          }
        />
        <Route
          path="/instituicoes/novo"
          element={
            <ProtectedPage>
              <InstitutionNewPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/instituicoes/:id"
          element={
            <ProtectedPage>
              <InstitutionDetailPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/alunos/novo"
          element={
            <ProtectedPage>
              <StudentNewPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/alunos/:id"
          element={
            <ProtectedPage>
              <StudentDetailPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/gerenciamento"
          element={
            <ProtectedPage>
              <GerenciamentoPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedPage>
              <DashboardPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedPage>
              <AdminPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/gabarito"
          element={
            <ProtectedPage>
              <GabaritoPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/trilhas/novo"
          element={
            <ProtectedPage>
              <TrailNewPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/trilhas/:trailId/stages/:stageNumber/questoes"
          element={
            <ProtectedPage>
              <TrailStageQuestionsPage />
            </ProtectedPage>
          }
        />
        <Route
          path="/trilhas/:id"
          element={
            <ProtectedPage>
              <TrailDetailPage />
            </ProtectedPage>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<AppRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
