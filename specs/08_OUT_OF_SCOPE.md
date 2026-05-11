# Out of Scope — Crias Trilhas

Na fase inicial, não implementar:

- login social;
- pagamento;
- gamificação avançada;
- ranking de alunos;
- dashboard pedagógico avançado;
- recomendação automática de trilha por IA;
- correção automática de redação;
- multi-idioma;
- app mobile próprio;
- envio direto pelo WhatsApp dentro do painel;
- integração com múltiplos provedores de chatbot;
- migração automática de dados legados;
- alteração do padrão de ids sem plano de migração;
- substituição do Firestore por outro banco;
- endpoints HTTP para o painel administrativo enquanto o painel continuar usando Firestore Client SDK.

## Regra

Qualquer item acima só pode entrar no escopo depois de:

1. atualizar este arquivo;
2. registrar decisão em `09_DECISIONS.md`;
3. criar spec específica;
4. atualizar `tests.yaml`;
5. atualizar `TASKS.md`.