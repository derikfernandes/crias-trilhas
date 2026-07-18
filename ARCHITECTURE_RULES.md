# Regras de Arquitetura — Crias Trilha

Este documento define **quem pode alterar o quê** neste repositório e **como trabalhar
sem quebrar os contratos** de API, banco de dados e integrações externas.

> Regra de ouro: o produto está em produção e sistemas externos dependem das rotas,
> payloads e coleções atuais. **Nenhum contrato pode mudar sem revisão do responsável
> técnico.**

---

## 1. Pastas liberadas para design (vibe coding)

Quem trabalha na parte visual pode alterar livremente:

| Pasta / arquivo | Conteúdo |
| --- | --- |
| `frontend/trilha-admin/src/components/` | Componentes visuais (formulários, tabelas, cards, chat) |
| `frontend/trilha-admin/src/pages/` | Páginas e layouts das rotas |
| `frontend/trilha-admin/src/styles/` | CSS global e da aplicação (`index.css`, `app.css`) |
| `frontend/trilha-admin/src/assets/` | Imagens, ícones e SVGs importados pelo código |
| `frontend/trilha-admin/public/` | Arquivos estáticos públicos (favicon, sprites de ícones) |
| `frontend/trilha-admin/index.html` | Título, metas e fontes da página |

Dentro dessas pastas é permitido mexer em: cores, tipografia, espaçamento,
responsividade, animações, acessibilidade visual, ícones, imagens e apresentação de
tabelas, cards, gráficos, formulários e menus.

**Atenção nas páginas (`src/pages/`):** algumas páginas ainda contêm lógica de dados
(chamadas ao Firestore via hooks `useEffect`). É permitido alterar o **JSX e as
classes CSS** dessas páginas, mas **não** os blocos que fazem `onSnapshot`, `getDocs`,
`query`, `fetch` ou manipulação de estado de dados. Em caso de dúvida, pergunte antes.

## 2. Pastas protegidas (exigem revisão do responsável técnico)

| Pasta / arquivo | Motivo |
| --- | --- |
| `api/` | Funções serverless da Vercel — contrato público da API REST |
| `server/` | Serviços e validações de backend |
| `frontend/trilha-admin/src/lib/` | Camada de acesso a dados (Firestore/API) do frontend |
| `frontend/trilha-admin/src/contexts/` | Autenticação e sessão |
| `frontend/trilha-admin/src/hooks/` | Hooks de auth e permissões |
| `frontend/trilha-admin/src/types/` | Tipos que espelham os documentos do banco |
| `vercel.json` (raiz e do frontend) | Rewrites de rotas públicas usadas por sistemas externos |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | Configuração e segurança do Firestore |
| `scripts/` | Scripts de auditoria e verificação |
| `package.json`, `package-lock.json` (raiz e frontend) | Dependências e comandos de build |
| `tsconfig*.json`, `vite.config.ts`, `eslint.config.js` | Configuração de build/lint |
| `.env*` | Variáveis de ambiente (nunca commitar) |

## 3. Arquivos que NÃO podem ser alterados em hipótese alguma sem o responsável técnico

- `api/*.ts` — cada arquivo é um endpoint público (`/api/institution`, `/api/student`,
  `/api/trails`, `/api/trail_stages`, `/api/trail_stage_questions`, `/api/student_trails`,
  `/api/conversation_logs`, `/api/exercise_attempts`, `/api/dashboard_summary`).
- `server/lib/*.ts` — regras de negócio e validação dos endpoints.
- `vercel.json` — mapeia URLs públicas (ex.: `/students/:id`) para os endpoints.
- `firestore.rules` — regras de segurança do banco.
- `frontend/trilha-admin/src/lib/firebase.ts` — inicialização do Firebase no cliente.
- Qualquer arquivo `.env*`.

## 4. Como criar ou modificar um componente visual

1. Crie o arquivo em `frontend/trilha-admin/src/components/MeuComponente.tsx`.
2. Receba **todos os dados via props** — o componente não deve buscar dados sozinho.
3. Estilos: use classes do `src/styles/app.css` ou adicione novas classes lá.
4. **Nunca** importe nos componentes visuais:
   - `firebase/*` ou `firebase-admin` (banco de dados);
   - arquivos de `src/lib/` que acessem o Firestore (`*Firestore.ts`, `firebase.ts`);
   - nada de `api/` ou `server/` (código de backend);
   - variáveis `import.meta.env` secretas (apenas `VITE_*` públicas já existentes, se necessário).
   O ESLint bloqueia essas importações automaticamente (regra `no-restricted-imports`).
5. Funções utilitárias de formatação/apresentação (ex.: `conversationLogFormat.ts`,
   `paths.ts`) podem ser importadas normalmente.

## 5. Como consumir dados sem acessar o backend diretamente

- Os dados chegam às páginas por funções e hooks já existentes:
  - `src/hooks/useAuth.ts` e `src/hooks/usePermissions.ts` — sessão e permissões;
  - `src/lib/dashboardSummaryApi.ts` — métricas do dashboard (via API REST);
  - `src/lib/trailApi.ts` — exclusão de trilha em cascata (via API REST);
  - funções `snapshotTo*` e mutações em `src/lib/*Firestore.ts` — leitura/escrita no Firestore.
- Se um componente novo precisa de um dado, **peça o dado via props** a partir da página,
  ou solicite ao responsável técnico a criação de um wrapper em `src/lib/`.
- Não copie lógica de consulta para dentro de componentes.

## 6. Comandos para validar as alterações

Execute na raiz do repositório:

```bash
npm run lint          # ESLint (inclui as regras de fronteira frontend/backend)
npm run typecheck     # Verificação de tipos TypeScript
npm run test          # Testes de contrato (rotas e validações)
npm run build         # Build de produção (tsc + vite)
```

Todos os quatro devem passar **sem erros novos** antes de qualquer entrega.

## 7. Regras antes de abrir um Pull Request

1. Trabalhe em uma branch própria (ex.: `design/ajuste-dashboard`).
2. Rode os quatro comandos da seção 6 e cole os resultados na descrição do PR.
3. Não misture alterações visuais com alterações de backend no mesmo PR.
4. Confira o diff: se aparecer qualquer arquivo das seções 2 ou 3, remova a alteração
   ou marque o responsável técnico como revisor obrigatório.
5. Não adicione dependências novas sem aprovação.
6. Não altere textos de mensagens de erro, nomes de campos, rotas ou URLs.
7. Descreva no PR quais telas foram afetadas e anexe screenshots do antes/depois.

---

## Mapa de dependências permitidas

```text
componentes visuais  → props, styles, utilitários de apresentação
páginas              → hooks públicos, wrappers de src/lib, componentes
src/lib (frontend)   → firebase (SDK cliente), API REST pública
api/ (backend)       → server/lib, firebase-admin
server/lib           → firebase-admin
```

Proibido:

```text
componentes visuais  ⇸ firebase/firestore, src/lib/*Firestore, secrets
frontend             ⇸ api/, server/, firebase-admin
server/ e api/       ⇸ frontend
```
