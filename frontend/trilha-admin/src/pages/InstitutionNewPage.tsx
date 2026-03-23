import { Link } from 'react-router-dom'
import { InstitutionForm } from '../components/InstitutionForm'

export function InstitutionNewPage() {
  return (
    <>
      <header className="admin__header">
        <h1>Nova instituição</h1>
        <p className="admin__lede">
          Após incluir, você será levado à página do registro, com o link
          definitivo.
        </p>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/">
            ← Voltar ao início
          </Link>
        </p>
      </header>
      <InstitutionForm />
    </>
  )
}
