# Decisions — Crias Trilhas

## Decisão 1 — Frontend em React + Vite

O projeto atual já usa React, Vite e TypeScript. Manter essa stack.

## Decisão 2 — Firestore como base principal

O projeto atual já usa Firebase/Firestore. Manter Firestore como banco principal.

## Decisão 3 — Painel usa Firestore Client SDK

O painel administrativo atual acessa Firestore diretamente via Firebase SDK.

Isso é aceito para o painel enquanto as regras de segurança estiverem adequadas.

## Decisão 4 — Chatis usa API HTTP

O Chatis não deve acessar Firestore diretamente.

Chatis deve consultar endpoints HTTP, e o backend deve acessar Firestore de forma segura.

## Decisão 5 — Stages têm comportamento; questions têm conteúdo

O campo `stage_type` e o `prompt` ficam em `trail_stages`.

O conteúdo entregue fica em `trail_stage_questions`.

## Decisão 6 — Trilha usa IDs sequenciais

Trilhas usam padrão `t1`, `t2`, `t3` com contador em `counters/trails`.

## Decisão 7 — Chatis não decide regra de avanço sozinho

A API deve retornar a próxima ação para o Chatis.

O Chatis apenas executa o fluxo.

## Decisão 8 — Toda ação nova precisa entrar no Action Routing Map

Antes de implementar uma nova ação, deve ser definido:

- origem;
- modo de acesso;
- collection ou endpoint;
- entrada;
- saída;
- regra de erro.

## Decisão 9 — Uso de agentes no dashboard via summary server-side

Os agentes de IA do Chatis gravam `conversation_logs` com `trail_id` textual
(ex.: `Trilha - Matemática`, `Tutor - Linguagens`), distinto dos ids `tN` das
trilhas reais.

Decisões:

1. Classificar agente por allowlist canônica e/ou prefixo `Trilha -` / `Tutor -`
   (ver `10_AGENT_USAGE_DASHBOARD.md`).
2. Agregar uso **somente** em `GET /api/dashboard_summary` (campo aditivo
   `agent_usage`), sem misturar agentes no índice de trilhas de progressão.
3. O painel **não** deve baixar `conversation_logs` brutos no browser para
   montar essas métricas; em falha do endpoint, erro + retry.
4. Não inventar agentes sem `trail_id` confirmado pelo produto.