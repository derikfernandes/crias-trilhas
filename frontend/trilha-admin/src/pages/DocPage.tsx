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

const STUDENT_ENDPOINTS: DocEndpoint[] = [
  {
    id: 'get-student-list',
    method: 'GET',
    path: '/student/',
    title: 'Listar alunos (com filtros)',
    description:
      'Retorna a lista de alunos. Use query params para filtrar por `institution_id`, `school_level`, `school_grade`, `student_level` e `active`.',
    auth: true,
    queryParams: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Filtra alunos pertencentes à instituição.',
      },
      {
        name: 'school_level',
        type: '"fundamental" | "médio"',
        required: false,
        description: 'Nível escolar do aluno (ex.: fundamental, médio).',
      },
      {
        name: 'school_grade',
        type: 'string',
        required: false,
        description:
          'Série/ano do aluno (ex.: "7º ano", "2º ano"). Não confundir com `student_level`. Valores comuns: `fundamental` → "1º ano" ... "9º ano"; `médio` → "1º ano" ... "3º ano".',
      },
      {
        name: 'student_level',
        type: '1 | 2 | 3',
        required: false,
        description:
          'Nível pedagógico atual. Se não preencher no cadastro, o backend usa default `2` (intermediário).',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas alunos ativos/inativos.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista de alunos (array JSON).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-student-simple',
    method: 'GET',
    path: '/student/simple',
    title: 'Listar alunos (formato simplificado)',
    description:
      'Versão reduzida do endpoint de listagem, útil para selects e telas leves.',
    auth: true,
    queryParams: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Filtra alunos pertencentes à instituição.',
      },
      {
        name: 'school_level',
        type: '"fundamental" | "médio"',
        required: false,
        description: 'Nível escolar do aluno (ex.: fundamental, médio).',
      },
      {
        name: 'school_grade',
        type: 'string',
        required: false,
        description:
          'Série/ano do aluno (ex.: "7º ano", "2º ano"). Não confundir com `student_level`. Valores comuns: `fundamental` → "1º ano" ... "9º ano"; `médio` → "1º ano" ... "3º ano".',
      },
      {
        name: 'student_level',
        type: '1 | 2 | 3',
        required: false,
        description: 'Nível pedagógico atual do aluno (1, 2 ou 3).',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas alunos ativos/inativos.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista simplificada (campos reduzidos).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-student-id',
    method: 'GET',
    path: '/student/{id}',
    title: 'Buscar aluno por ID',
    description: 'Obtém os dados de um aluno a partir do identificador único.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador único do aluno no sistema.',
      },
    ],
    responses: [
      { code: '200', description: 'Objeto do aluno encontrado.' },
      { code: '404', description: 'Aluno não encontrado para o id informado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-student-phone',
    method: 'GET',
    path: '/student/{phone_number}',
    title: 'Buscar aluno por phone_number',
    description:
      'Obtém os dados de um aluno a partir do telefone (phone_number). A busca é feita pelos dígitos; caracteres não numéricos são removidos pelo backend.',
    auth: true,
    pathParams: [
      {
        name: 'phone_number',
        type: 'string',
        description:
          'Telefone do aluno. Quando usado no path, a rota captura apenas dígitos.',
      },
    ],
    responses: [
      { code: '200', description: 'Objeto do aluno encontrado.' },
      { code: '404', description: 'Aluno não encontrado para o telefone informado.' },
      { code: '400', description: 'Telefone inválido (sem dígitos).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'post-student',
    method: 'POST',
    path: '/student/',
    title: 'Criar novo aluno',
    description:
      'Cria um novo aluno vinculado a uma instituição. Campos importantes: `school_level`/`school_grade` representam a série/ano escolar; `student_level` representa o nível pedagógico atual e é independente deles. Se `student_level` não for enviado, o backend assume default `2` (intermediário).',
    auth: true,
    bodyFields: [
      {
        name: 'institution_id',
        type: 'string',
        required: true,
        description: 'ID da instituição de ensino do aluno.',
        example: 'inst_abc123',
      },
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Nome completo do aluno.',
        example: 'João da Silva',
      },
      {
        name: 'phone_number',
        type: 'string',
        required: true,
        description:
          'Telefone de contato. O backend/painel salva apenas números (remove `+`, espaços, hífen, parênteses etc.).',
        example: '+55 11 99999-0000',
      },
      {
        name: 'school_level',
        type: '"fundamental" | "médio"',
        required: true,
        description:
          'Nível escolar. Use "fundamental" ou "médio" (equivalente a ensino médio).',
        example: 'fundamental',
      },
      {
        name: 'school_grade',
        type: 'string',
        required: true,
        description:
          'Série/ano escolar (ex.: "7º ano"). Não confundir com `student_level`. Valores comuns: `fundamental` → "1º ano" ... "9º ano"; `médio` → "1º ano" ... "3º ano".',
        example: '7º ano',
      },
      {
        name: 'student_level',
        type: '1 | 2 | 3',
        required: false,
        description:
          'Nível pedagógico atual (1, 2, 3). Default quando não preenchido: `2`.',
        example: '1',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description:
          'Indica se o aluno está ativo. Se não enviar, o backend usa `true`.',
        example: 'true',
      },
    ],
    bodyExample: `{
  "institution_id": "inst_abc123",
  "name": "João da Silva",
  "phone_number": "+55 11 99999-0000",
  "school_level": "fundamental",
  "school_grade": "7º ano",
  "student_level": 1,
  "active": true
}
{
  "institution_id": "inst_abc123",
  "name": "Maria Souza",
  "phone_number": "+55 11 98888-0000",
  "school_level": "fundamental",
  "school_grade": "7º ano",
  "active": true
  // student_level omitido -> default 2 (intermediário)
}
{
  "institution_id": "inst_abc123",
  "name": "Carlos Pereira",
  "phone_number": "+55 11 97777-0000",
  "school_level": "fundamental",
  "school_grade": "7º ano",
  "student_level": 3,
  "active": true
}
{
  "institution_id": "inst_abc123",
  "name": "Ana Oliveira",
  "phone_number": "+55 11 96666-0000",
  "school_level": "médio",
  "school_grade": "1º ano",
  "student_level": 1,
  "active": true
}
{
  "institution_id": "inst_abc123",
  "name": "Pedro Santos",
  "phone_number": "+55 11 95555-0000",
  "school_level": "médio",
  "school_grade": "1º ano",
  "student_level": 2,
  "active": true
}
{
  "institution_id": "inst_abc123",
  "name": "Bruna Costa",
  "phone_number": "+55 11 94444-0000",
  "school_level": "médio",
  "school_grade": "1º ano",
  "student_level": 3,
  "active": true
}`,
    responses: [
      { code: '201', description: 'Criado — aluno disponível no corpo.' },
      { code: '400', description: 'Dados inválidos ou campos obrigatórios ausentes.' },
      { code: '401', description: 'Não autenticado — token ausente ou inválido.' },
    ],
  },
  {
    id: 'put-student-id',
    method: 'PUT',
    path: '/student/{id}',
    title: 'Atualizar aluno',
    description:
      'Atualiza campos do aluno indicado pelo `id`. O corpo pode ser parcial: envie somente os campos que deseja alterar.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador do aluno a ser atualizado.',
      },
    ],
    bodyFields: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Pode re-vincular o aluno a outra instituição (se regra permitir).',
      },
      {
        name: 'name',
        type: 'string',
        required: false,
        description: 'Novo nome do aluno.',
      },
      {
        name: 'phone_number',
        type: 'string',
        required: false,
        description:
          'Novo telefone do aluno. O backend/painel salva apenas dígitos (remove caracteres não numéricos).',
      },
      {
        name: 'school_level',
        type: '"fundamental" | "médio"',
        required: false,
        description: 'Atualiza o nível escolar.',
      },
      {
        name: 'school_grade',
        type: 'string',
        required: false,
        description: 'Atualiza a série/ano escolar.',
      },
      {
        name: 'student_level',
        type: '1 | 2 | 3',
        required: false,
        description: 'Atualiza o nível pedagógico atual.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Ativa/desativa o aluno.',
      },
    ],
    responses: [
      { code: '200', description: 'Aluno atualizado com sucesso.' },
      { code: '400', description: 'Payload inválido.' },
      { code: '404', description: 'Aluno não encontrado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'delete-student-id',
    method: 'DELETE',
    path: '/student/{id}',
    title: 'Deletar aluno',
    description:
      'Remove permanentemente o registro do aluno. Operação irreversível; valide regras de negócio no backend.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador do aluno a ser removido.',
      },
    ],
    responses: [
      { code: '204', description: 'Exclusão concluída (No Content).' },
      { code: '404', description: 'Aluno não encontrado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
]

const TRAIL_ENDPOINTS: DocEndpoint[] = [
  {
    id: 'get-trail-list',
    method: 'GET',
    path: '/trails/',
    title: 'Listar trilhas (com filtros)',
    description:
      'Retorna a lista de trilhas. Use query params para filtrar por `institution_id` e `active`.',
    auth: true,
    queryParams: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Filtra trilhas pertencentes à instituição.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas trilhas ativas/inativas.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista de trilhas (array JSON).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-trail-simple',
    method: 'GET',
    path: '/trails/simple',
    title: 'Listar trilhas (formato simplificado)',
    description:
      'Versão reduzida da listagem, útil para selects e telas leves.',
    auth: true,
    queryParams: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Filtra trilhas pertencentes à instituição.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas trilhas ativas/inativas.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista simplificada (campos reduzidos).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-trail-id',
    method: 'GET',
    path: '/trails/{id}',
    title: 'Buscar trilha por ID',
    description:
      'Obtém os dados de uma única trilha a partir do identificador único.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador único da trilha no sistema.',
      },
    ],
    responses: [
      { code: '200', description: 'Objeto da trilha encontrado.' },
      { code: '404', description: 'Trilha não encontrada para o id informado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'post-trail',
    method: 'POST',
    path: '/trails/',
    title: 'Criar nova trilha',
    description:
      'Cria uma nova trilha com os campos macro. `default_total_steps_per_stage` é opcional e o backend usa default `8` quando não enviado.',
    auth: true,
    bodyFields: [
      {
        name: 'institution_id',
        type: 'string',
        required: true,
        description: 'ID da instituição dona da trilha.',
        example: 'inst_abc123',
      },
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Nome/identificador da trilha.',
        example: 'Trilha de Matemática Básica',
      },
      {
        name: 'description',
        type: 'string',
        required: true,
        description: 'Descrição geral da trilha.',
        example: 'Visão macro do conteúdo e objetivos...',
      },
      {
        name: 'subject',
        type: 'string',
        required: true,
        description: 'Matéria ou tema principal da trilha.',
        example: 'Matemática',
      },
      {
        name: 'default_total_steps_per_stage',
        type: 'number (inteiro)',
        required: false,
        description:
          'Valor padrão de passos por stage (o backend usa `8` se omitido).',
        example: '8',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Indica se a trilha está ativa no sistema.',
        example: 'true',
      },
    ],
    responses: [
      { code: '201', description: 'Trilha criada com sucesso.' },
      { code: '400', description: 'Dados inválidos ou campos obrigatórios ausentes.' },
      { code: '401', description: 'Não autenticado — token ausente ou inválido.' },
    ],
  },
  {
    id: 'put-trail-id',
    method: 'PUT',
    path: '/trails/{id}',
    title: 'Atualizar trilha',
    description:
      'Atualiza campos da trilha indicada pelo `id`. O corpo pode ser parcial.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador da trilha a ser atualizada.',
      },
    ],
    bodyFields: [
      {
        name: 'institution_id',
        type: 'string',
        required: false,
        description: 'Pode re-vincular a trilha a outra instituição.',
      },
      { name: 'name', type: 'string', required: false, description: 'Novo nome da trilha.' },
      { name: 'description', type: 'string', required: false, description: 'Nova descrição geral.' },
      { name: 'subject', type: 'string', required: false, description: 'Novo tema/matéria principal.' },
      {
        name: 'default_total_steps_per_stage',
        type: 'number (inteiro)',
        required: false,
        description: 'Novo valor padrão de passos por stage.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Ativa/desativa a trilha.',
      },
    ],
    responses: [
      { code: '200', description: 'Trilha atualizada com sucesso.' },
      { code: '400', description: 'Payload inválido.' },
      { code: '404', description: 'Trilha não encontrada.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'delete-trail-id',
    method: 'DELETE',
    path: '/trails/{id}',
    title: 'Deletar trilha',
    description:
      'Remove permanentemente o registro da trilha. Operação irreversível; valide regras de negócio no backend.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador da trilha a ser removida.',
      },
    ],
    responses: [
      { code: '204', description: 'Exclusão concluída (No Content).' },
      { code: '404', description: 'Trilha não encontrada.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
]

const TRAIL_STAGE_ENDPOINTS: DocEndpoint[] = [
  {
    id: 'get-trail-stage-list',
    method: 'GET',
    path: '/trail_stages/',
    title: 'Listar stages (com filtros)',
    description:
      'Retorna a lista de stages. Use query params para filtrar por `trail_id`, `active` e `is_released`.',
    auth: true,
    queryParams: [
      {
        name: 'trail_id',
        type: 'string',
        required: false,
        description: 'Filtra stages pertencentes à trilha.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas stages ativas/inativas.',
      },
      {
        name: 'is_released',
        type: 'boolean',
        required: false,
        description: 'Filtra apenas stages liberadas/não liberadas.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista de stages (array JSON).' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-trail-stage-simple',
    method: 'GET',
    path: '/trail_stages/simple',
    title: 'Listar stages (formato simplificado)',
    description: 'Versão reduzida da listagem.',
    auth: true,
    queryParams: [
      {
        name: 'trail_id',
        type: 'string',
        required: false,
        description: 'Filtra stages pertencentes à trilha.',
      },
    ],
    responses: [
      { code: '200', description: 'Lista simplificada.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'get-trail-stage-id',
    method: 'GET',
    path: '/trail_stages/{id}',
    title: 'Buscar stage por ID',
    description: 'Obtém os dados de um único stage.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador do stage (docId).',
      },
    ],
    responses: [
      { code: '200', description: 'Objeto do stage encontrado.' },
      { code: '404', description: 'Stage não encontrado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'post-trail-stage',
    method: 'POST',
    path: '/trail_stages/',
    title: 'Criar novo stage',
    description:
      'Cria um novo stage de uma trilha. `is_released` inicia como `false` e `active` inicia como `true`.',
    auth: true,
    bodyFields: [
      {
        name: 'trail_id',
        type: 'string',
        required: true,
        description: 'ID da trilha a que o stage pertence.',
        example: 'trail_001',
      },
      {
        name: 'stage_number',
        type: 'number (inteiro)',
        required: true,
        description: 'Número sequencial do stage (começa em 1). Deve ser único dentro da mesma trail.',
        example: '1',
      },
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Nome do stage.',
        example: 'Frações básicas',
      },
    ],
    responses: [
      { code: '201', description: 'Stage criado com sucesso.' },
      { code: '400', description: 'Dados inválidos ou conflito de stage_number.' },
      { code: '401', description: 'Não autenticado — token ausente ou inválido.' },
    ],
  },
  {
    id: 'put-trail-stage-id',
    method: 'PUT',
    path: '/trail_stages/{id}',
    title: 'Atualizar stage',
    description: 'Atualiza campos do stage. `stage_number` e `trail_id` não são suportados para mudança.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador do stage a ser atualizado.',
      },
    ],
    bodyFields: [
      {
        name: 'title',
        type: 'string',
        required: false,
        description: 'Novo título do stage.',
      },
      {
        name: 'is_released',
        type: 'boolean',
        required: false,
        description: 'Define se o stage está liberado para os alunos.',
      },
      {
        name: 'active',
        type: 'boolean',
        required: false,
        description: 'Define se o stage está ativo no sistema.',
      },
    ],
    responses: [
      { code: '200', description: 'Stage atualizado com sucesso.' },
      { code: '400', description: 'Payload inválido.' },
      { code: '404', description: 'Stage não encontrado.' },
      { code: '401', description: 'Não autenticado.' },
    ],
  },
  {
    id: 'delete-trail-stage-id',
    method: 'DELETE',
    path: '/trail_stages/{id}',
    title: 'Deletar stage',
    description: 'Remove permanentemente o stage.',
    auth: true,
    pathParams: [
      {
        name: 'id',
        type: 'string',
        description: 'Identificador do stage a ser removido.',
      },
    ],
    responses: [
      { code: '204', description: 'Exclusão concluída (No Content).' },
      { code: '404', description: 'Stage não encontrado.' },
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
          Referência dos endpoints REST dos recursos{' '}
          <strong>Institution</strong>, <strong>Student</strong>, <strong>Trails</strong>{' '}
          e <strong>Trail stages</strong> (gerenciamento de instituições, alunos,
          trilhas e stages pedagógicos). Cada bloco indica o{' '}
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

      <section className="panel doc__section">
        <h2>Student (Aluno) — endpoints</h2>
        <p className="doc__section-intro muted">
          Rotas para cadastrar e gerenciar alunos vinculados a instituições.
          `student_level` é independente de `school_grade` (ano/série escolar).
        </p>

        <div className="doc__endpoints">
          {STUDENT_ENDPOINTS.map((ep) => (
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

      <section className="panel doc__section">
        <h2>Trails — endpoints</h2>
        <p className="doc__section-intro muted">
          Rotas para cadastrar e gerenciar trilhas com campos macro.
        </p>

        <div className="doc__endpoints">
          {TRAIL_ENDPOINTS.map((ep) => (
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

      <section className="panel doc__section">
        <h2>Trail stages — endpoints</h2>
        <p className="doc__section-intro muted">
          Rotas para cadastrar e gerenciar stages de trilhas pedagógicas.
        </p>

        <div className="doc__endpoints">
          {TRAIL_STAGE_ENDPOINTS.map((ep) => (
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
                            <td>{f.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
