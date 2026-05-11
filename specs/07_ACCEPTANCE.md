# Acceptance Criteria — Crias Trilhas

## 1. SDD

A entrega será aceita quando:

- [ ] Toda funcionalidade nova tiver SPEC antes do código.
- [ ] Toda alteração relevante atualizar `tests.yaml`.
- [ ] Toda decisão arquitetural estiver em `DECISIONS.md`.
- [ ] Todo fora de escopo estiver documentado.
- [ ] Toda ação nova estiver no `ACTION_ROUTING_MAP.md`.

## 2. Painel

- [ ] Instituições podem ser criadas e listadas.
- [ ] Alunos podem ser criados e vinculados a instituições.
- [ ] Trilhas podem ser criadas em 3 etapas.
- [ ] Stages são criados automaticamente a partir da estrutura.
- [ ] Conteúdos são salvos em `trail_stage_questions`.
- [ ] Erros de Firebase aparecem claramente.
- [ ] Rotas quebradas redirecionam para início.

## 3. Modelo de dados

- [ ] Trail tem `institution_id`.
- [ ] Stage tem `trail_id` e `stage_number`.
- [ ] Question tem `trail_id`, `stage_number` e `question_number`.
- [ ] Stage IA exige `prompt`.
- [ ] Stage fixed/exercise tem `prompt = null`.
- [ ] Student tem `student_level` 1, 2 ou 3.

## 4. Chatis

- [ ] API identifica aluno por telefone.
- [ ] API identifica trilha ativa.
- [ ] API identifica próximo stage/question.
- [ ] API bloqueia conteúdo não liberado.
- [ ] API retorna `stage_type`.
- [ ] API retorna `prompt` quando `stage_type = ai`.
- [ ] API marca conclusão quando não há próxima questão.

## 5. Qualidade

- [ ] `npm run lint` passa.
- [ ] `npm run build` passa.
- [ ] Documentação mínima existe.
- [ ] QA adversarial não encontra divergência crítica entre spec e código.