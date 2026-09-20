# Spec — Uso de agentes no dashboard

## 1. Objetivo

Exibir no dashboard administrativo o volume de uso dos agentes de IA
(fora da trilha estruturada `tN`), com agregação **somente server-side**,
sem baixar `conversation_logs` brutos no browser, e sem misturar esses
`trail_id` nas métricas de conclusão/acerto das trilhas reais.

## 2. Agentes canônicos

| `trail_id` (exato) | Label PT |
|---|---|
| `Trilha - Matemática` | Matemática |
| `Trilha - Geral` | Geral |
| `Trilha - Humanas` | Humanas |
| `Trilha - Natureza` | Natureza |
| `Tutor - Linguagens` | Linguagens |

### Classificação

Um `trail_id` é **agente** quando:

1. está na allowlist canônica acima; **ou**
2. começa com `Trilha -` ou `Tutor -`.

Um `trail_id` é **trilha real** quando existe na collection `trails` da
instituição (padrão `tN`). Somente trilhas reais entram em
`trail_ids` / `students.answers` / `extra_done` do summary.

Agentes **não** entram no índice de trilhas do summary de progressão.
Não inventar agentes (ex.: Maria Diretora) sem `trail_id` confirmado.

## 3. Endpoint

### `GET /api/dashboard_summary?institution_id=...`

Já existente. Extensão **aditiva** (campos novos; campos atuais
permanecem compatíveis).

Query opcional:

- `period_days` — `0` (padrão, todo o período), `7` ou `30`. Filtra logs
  pela data de criação (`created_at` / `created_at_brasilia`).

Resposta adicional:

```json
{
  "agent_usage": {
    "period_days": 0,
    "total_messages": 123,
    "agents": [
      {
        "trail_id": "Trilha - Matemática",
        "label": "Matemática",
        "messages": 40,
        "unique_students": 12,
        "pct_of_total": 32.5,
        "last_activity": "2026-09-18T14:22:01.000Z",
        "student_ids": ["s1", "s2"]
      }
    ],
    "series": [
      { "date": "2026-09-18", "trail_id": "Trilha - Matemática", "messages": 5 }
    ]
  }
}
```

Regras:

- Contar **todas** as mensagens (qualquer `sender`) cujo `trail_id` seja agente.
- `pct_of_total` = `messages / total_messages * 100` (1 casa decimal), ou `0`
  se `total_messages = 0`.
- Incluir na lista todos os agentes canônicos mesmo com zero mensagens
  (ordem: allowlist; demais agentes descobertos por prefixo ao final,
  ordenados por mensagens desc).
- `series`: buckets diários (America/Sao_Paulo) por agente, só dias com
  atividade; vazio se não houver mensagens.
- Continuar **ignorando** `trail_id` de agente no bloco `students` de
  progressão (não indexar em `trail_ids`).

## 4. Performance do dashboard (geral)

- Preferir `/api/dashboard_summary` para métricas de logs.
- **Não** fazer fallback que baixa `conversation_logs` no cliente; em falha,
  exibir erro + retry.
- Onde realtime não for crítico (stages, questões, e dados base do
  dashboard), preferir `getDocs` one-shot em vez de `onSnapshot`.
- Loading progressivo: KPIs básicos e bloco de agentes podem aparecer
  assim que o summary chegar; charts pesados reutilizam o mesmo payload.

## 5. UI — bloco “Agentes de IA”

Copy em português.

### Tabela

Colunas: Agente | Mensagens | Alunos únicos | % do total | Última atividade.

- Ordenação por coluna.
- Filtro de período: Todo período | 7 dias | 30 dias (refetch do summary).
- Clique na linha: detalhe com alunos que usaram o agente (ids/nomes
  quando disponíveis na lista de alunos já carregada).

### Gráficos

- Barras: volume de mensagens por agente.
- Share: participação percentual (pizza/arco ou barras empilhadas).
- Série temporal opcional: mensagens/dia (agregado ou por agente).

Estados: loading, vazio (“Nenhuma interação com agentes no período.”), erro.

## 6. Fora de escopo desta spec

- Inventar agentes sem `trail_id`.
- Alterar motor Chatis / gravação de logs.
- Pré-agregação persistida em Firestore (pode entrar em hardening futuro).

## 7. Aceite

- Specs `08`, `09`, `TASKS`, `tests.yaml` atualizados.
- Summary devolve `agent_usage` sem quebrar métricas `tN`.
- Dashboard não baixa logs brutos no cliente para métricas.
- Tabela + gráficos com estados vazios/loading/erro.
- Testes unitários do classificador + agregação; lint, typecheck e build verdes.
