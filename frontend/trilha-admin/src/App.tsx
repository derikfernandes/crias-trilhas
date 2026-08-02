import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AdminLayout } from './layouts/AdminLayout'
import { ProtectedPage } from './layouts/RouteGuards'
import { LoginPage } from './pages/LoginPage'
import './design/styles/app.css'

// Code splitting: cada página vira um chunk próprio, carregado sob demanda.
// Os componentes e o comportamento das páginas permanecem idênticos.
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const DocPage = lazy(() =>
  import('./pages/DocPage').then((m) => ({ default: m.DocPage })),
)
const GabaritoPage = lazy(() =>
  import('./pages/GabaritoPage').then((m) => ({ default: m.GabaritoPage })),
)
const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const InstitutionDetailPage = lazy(() =>
  import('./pages/InstitutionDetailPage').then((m) => ({
    default: m.InstitutionDetailPage,
  })),
)
const InstitutionNewPage = lazy(() =>
  import('./pages/InstitutionNewPage').then((m) => ({
    default: m.InstitutionNewPage,
  })),
)
const TrailDetailPage = lazy(() =>
  import('./pages/TrailDetailPage').then((m) => ({
    default: m.TrailDetailPage,
  })),
)
const TrailStageQuestionsPage = lazy(() =>
  import('./pages/TrailStageQuestionsPage').then((m) => ({
    default: m.TrailStageQuestionsPage,
  })),
)
const TrailNewPage = lazy(() =>
  import('./pages/TrailNewPage').then((m) => ({ default: m.TrailNewPage })),
)
const StudentDetailPage = lazy(() =>
  import('./pages/StudentDetailPage').then((m) => ({
    default: m.StudentDetailPage,
  })),
)
const StudentNewPage = lazy(() =>
  import('./pages/StudentNewPage').then((m) => ({ default: m.StudentNewPage })),
)
const GerenciamentoPage = lazy(() =>
  import('./pages/GerenciamentoPage').then((m) => ({
    default: m.GerenciamentoPage,
  })),
)
const StudentsListPage = lazy(() =>
  import('./pages/StudentsListPage').then((m) => ({
    default: m.StudentsListPage,
  })),
)
const TrailsListPage = lazy(() =>
  import('./pages/TrailsListPage').then((m) => ({
    default: m.TrailsListPage,
  })),
)

const routerBasename =
  import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

function AppRoutes() {
  return (
    <AdminLayout>
      <Suspense fallback={<p className="muted">Carregando…</p>}>
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
            path="/alunos"
            element={
              <ProtectedPage>
                <StudentsListPage />
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
            path="/trilhas"
            element={
              <ProtectedPage>
                <TrailsListPage />
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
      </Suspense>
    </AdminLayout>
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
