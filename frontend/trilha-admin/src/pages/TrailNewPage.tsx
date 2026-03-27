import { Link } from 'react-router-dom'
import { TrailForm } from '../components/TrailForm'

export function TrailNewPage() {
  return (
    <>
      <header className="admin__header">
        <h1>Nova trilha</h1>
        <p className="admin__lede">
          Após incluir, você será levado à página do registro para edição.
        </p>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/">
            ← Voltar ao início
          </Link>
        </p>
      </header>
      <TrailForm />
    </>
  )
}

