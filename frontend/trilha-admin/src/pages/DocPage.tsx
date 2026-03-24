import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PRODUCTION_API_DOC_BASE, PRODUCTION_APP_ORIGIN } from '../lib/site'

const DEFAULT_BASE =
  import.meta.env.VITE_API_BASE_URL ?? PRODUCTION_API_DOC_BASE

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

type DocEndpoint = {
  id: string
  method: HttpMethod
  path: string
  title: string
  description: string
  auth: boolean
  pathParams?: { name: string; type: string; description: string }[]
  queryParams?: { name: string; type: string; required: boolean; description: string }[]
  bodyFields?: {
    name: string
    type: string
    required: boolean
    description: string
    example?: string
  }[]
  bodyExample?: string
  responses: { code: string; description: string }[]
}

const INSTITUTION_ENDPOINTS: DocEndpoint[] = [
  {
    id: 'post-institution',
    method: 'POST',
    path: '/institution/',
    title: 'Criar nova instituição',
    description:
      'Cria uma nova instituição no sistema. Envie um JSON no corpo da requisição com os dados cadastrais.',
    auth: true,
    bodyFields: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Nome da instituição de ensino.',
        example: 'Escola Alpha',
      },
      {
        name: 'type',
        type: 'string',
        required: true,
        description: 'Categoria: escola, cursinho, plataforma, etc.',
        example: 'escola',
      },
      {
        name: 'document',
        type: 'string',
        required: true,
        description: 'Identificador oficial (CNPJ, registro ou documento interno).',
        example: '12.345.678/0001-90',
      },
      {
        name: 'email',
        type: 'string',
        required: true,
        description: 'E-mail de contato da instituição.',
        example: 'contato@escolaalpha.edu.br',
      },
      {
        name: 'phone',
        type: 'string',
        required: true,
        description: 'Telefone de contato (formato livre ou E.164).',
        example: '+55 11 99999-0000',
      },
    ],
    bodyExample: `{
  "name": "Escola Alpha",
  "type": "escola",
  "document": "12.345.678/0001-90",
  "email": "contato@escolaalpha.edu.br",
  "phone": "+55 11 99999-0000"
}`,
    responses: [
      { code: '200', description: 'Instituição criada com sucesso (resposta padrão).' },
      { code: '201', description: 'Criado — recurso disponível no corpo ou no cabeçalho Location.' },
      { code: '400', description: 'Dados inválidos ou campos obrigatórios ausentes.' },
      { code: '401', description: 'Não autenticado — token ausente ou inválido.' },
    ],
  },
  {
    id: 'get-institution-list',
    method: 'GET',
    path: '/institution/',
    title: 'Listar todas as instituições',
    description:
      'Retorna a lista completa de instituições cadastradas, em geral com todos os campos do modelo.',
    auth: true,
    responses: [
      { code: '200', description: 'Lista de instituições (array JSON).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-institution-simple',
    method: 'GET',
    path: '/institution/simple',
    title: 'Listar instituições (formato simplificado)',
    description:
      'Retorna uma lista reduzida de instituições (por exemplo, apenas id, nome e tipo), útil para selects e telas leves.',
    auth: true,
    responses: [
      { code: '200', description: 'Lista simplificada (estrutura definida pelo backend).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-institution-id',
    method: 'GET',
    path: '/institution/{id}',
    title: 'Buscar instituição por ID',
    description: 'Obtém os dados de uma única instituição a partir do identificador único.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador único da instituição no sistema.',
      },
    ],
    responses: [
      { code: '200', description: 'Objeto da instituição encontrada.' },
      { code: '404', description: 'Instituição não encontrada para o id informado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'put-institution-id',
    method: 'PUT',
    path: '/institution/{id}',
    title: 'Atualizar instituição',
    description:
      'Substitui ou atualiza os dados da instituição indicada pelo id. O corpo segue o mesmo formato de criação (total ou parcial, conforme contrato do backend).',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador da instituição a ser atualizada.',
      },
    ],
    bodyFields: [
      {
        name: 'name',
        type: 'string',
        required: false,
        description: 'Novo nome (se enviado).',
      },
      {
        name: 'type',
        type: 'string',
        required: false,
        description: 'Novo tipo (se enviado).',
      },
      {
        name: 'document',
        type: 'string',
        required: false,
        description: 'Novo documento (se enviado).',
      },
      {
        name: 'email',
        type: 'string',
        required: false,
        description: 'Novo e-mail (se enviado).',
      },
      {
        name: 'phone',
        type: 'string',
        required: false,
        description: 'Novo telefone (se enviado).',
      },
    ],
    bodyExample: `{
  "name": "Escola Alpha — Unidade Centro",
  "email": "novoemail@escolaalpha.edu.br"
}`,
    responses: [
      { code: '200', description: 'Instituição atualizada com sucesso.' },
      { code: '400', description: 'Payload inválido.' },
      { code: '404', description: 'Instituição não encontrada.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'delete-institution-id',
    method: 'DELETE',
    path: '/institution/{id}',
    title: 'Deletar instituição',
    description:
      'Remove permanentemente o registro da instituição. Operação irreversível; confirme regras de negócio no backend.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador da instituição a ser removida.',
      },
    ],
    responses: [
      { code: '200', description: 'Exclusão concluída (ou 204 No Content, conforme API).' },
      { code: '404', description: 'Instituição não encontrada.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
]

const METHOD_EXPLAIN: Record<HttpMethod, string> = {
  GET: 'Consulta — lê dados do servidor sem alterar o estado do recurso (idempotente).',
  POST: 'Criação — envia um corpo (body) para criar um novo recurso; gera um novo id no servidor.',
  PUT: 'Atualização — envia o recurso (ou campos) para substituir/atualizar o registro identificado na URL.',
  DELETE: 'Exclusão — remove o recurso identificado na URL.',
}

export function DocPage() {
  const baseUrl = useMemo(() => DEFAULT_BASE.replace(/\/$/, ''), [])

  return (
    <>
      <header className="admin__header">
        <h1>Documentação da API</h1>
        <p className="admin__lede">
          Referência dos endpoints REST do recurso <strong>Institution</strong>{' '}
          (gerenciamento de instituições). Cada bloco indica o{' '}
          <strong>método HTTP</strong>, o <strong>caminho</strong>, o que a rota
          faz e os parâmetros ou corpo esperados.
        </p>
        <p className="admin__lede muted">
          <strong>Painel (esta interface) em produção:</strong>{' '}
          <a href={PRODUCTION_APP_ORIGIN} target="_blank" rel="noreferrer">
            {PRODUCTION_APP_ORIGIN}
          </a>
          . Todas as variáveis <code>VITE_*</code> vão no <code>.env</code> local ou
          em <strong>Settings → Environment Variables</strong> na Vercel (não dependem
          de <code>localhost</code>).
        </p>
        <p className="doc__base">
          <span className="doc__base-label">Base URL da API</span>
          <code className="doc__base-value">{baseUrl}</code>
          {!import.meta.env.VITE_API_BASE_URL ? (
            <span className="muted doc__base-hint">
              Padrão: mesmo host do app na Vercel. Se a API REST estiver em outro domínio,
              defina <code>VITE_API_BASE_URL</code> no <code>.env</code> ou na Vercel.
            </span>
          ) : null}
        </p>
        <p className="admin__actions">
          <Link className="btn btn--ghost" to="/">
            ← Voltar ao início
          </Link>
        </p>
      </header>

      <section className="panel doc__methods-legend">
        <h2>Métodos HTTP</h2>
        <ul className="doc__legend-list">
          {(Object.keys(METHOD_EXPLAIN) as HttpMethod[]).map((m) => (
            <li key={m}>
              <span className={`doc-method doc-method--${m.toLowerCase()}`}>
                {m}
              </span>
              <span>{METHOD_EXPLAIN[m]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel doc__section">
        <h2>Institution — endpoints</h2>
        <p className="doc__section-intro muted">
          Rotas agrupadas por recurso. Ícone de cadeado indica que o backend pode
          exigir autenticação (por exemplo, cabeçalho{' '}
          <code>Authorization: Bearer &lt;token&gt;</code>).
        </p>

        <div className="doc__endpoints">
          {INSTITUTION_ENDPOINTS.map((ep) => (
            <details key={ep.id} className="doc-endpoint">
              <summary className="doc-endpoint__summary">
                <span
                  className={`doc-method doc-method--${ep.method.toLowerCase()}`}
                >
                  {ep.method}
                </span>
                <code className="doc-endpoint__path">{ep.path}</code>
                <span className="doc-endpoint__title">{ep.title}</span>
                {ep.auth ? (
                  <span
                    className="doc-endpoint__lock"
                    title="Pode exigir autenticação"
                    aria-label="Autenticação"
                  >
                    <LockIcon />
                  </span>
                ) : null}
              </summary>

              <div className="doc-endpoint__body">
                <p className="doc-endpoint__desc">{ep.description}</p>

                <p className="doc-endpoint__fullurl">
                  <span className="muted">URL completa de exemplo:</span>{' '}
                  <code>
                    {ep.method} {baseUrl}
                    {ep.path.replace('{id}', '{id}')}
                  </code>
                </p>

                {ep.pathParams?.length ? (
                  <div className="doc-block">
                    <h3 className="doc-block__title">Parâmetros de path</h3>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Tipo</th>
                          <th>Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.pathParams.map((p) => (
                          <tr key={p.name}>
                            <td>
                              <code>{p.name}</code>
                            </td>
                            <td>{p.type}</td>
                            <td>{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {ep.queryParams?.length ? (
                  <div className="doc-block">
                    <h3 className="doc-block__title">Query</h3>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Tipo</th>
                          <th>Obrigatório</th>
                          <th>Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.queryParams.map((q) => (
                          <tr key={q.name}>
                            <td>
                              <code>{q.name}</code>
                            </td>
                            <td>{q.type}</td>
                            <td>{q.required ? 'Sim' : 'Não'}</td>
                            <td>{q.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {ep.bodyFields?.length ? (
                  <div className="doc-block">
                    <h3 className="doc-block__title">Corpo da requisição (JSON)</h3>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Campo</th>
                          <th>Tipo</th>
                          <th>Obrigatório</th>
                          <th>Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.bodyFields.map((f) => (
                          <tr key={f.name}>
                            <td>
                              <code>{f.name}</code>
                            </td>
                            <td>{f.type}</td>
                            <td>{f.required ? 'Sim' : 'Não'}</td>
                            <td>
                              {f.description}
                              {f.example ? (
                                <span className="doc-example">
                                  {' '}
                                  Ex.: <code>{f.example}</code>
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {ep.bodyExample ? (
                      <pre className="doc-pre" tabIndex={0}>
                        <code>{ep.bodyExample}</code>
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                <div className="doc-block">
                  <h3 className="doc-block__title">Respostas</h3>
                  <ul className="doc-responses">
                    {ep.responses.map((r) => (
                      <li key={r.code}>
                        <span
                          className={`doc-code doc-code--${r.code.startsWith('2') ? 'ok' : r.code.startsWith('4') ? 'client' : 'other'}`}
                        >
                          {r.code}
                        </span>
                        {r.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
