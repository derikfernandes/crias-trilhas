# Skill: SDD Planner

## Quando usar

Use esta skill antes de qualquer alteracao relevante no projeto Crias Trilhas.

## Objetivo

Transformar uma ideia bruta em arquivos de especificacao claros, testaveis e versionados.

## Arquivos que deve ler

- specs/00_PROJECT_OVERVIEW.md
- specs/01_DOMAIN_MODEL.md
- specs/05_ACTION_ROUTING_MAP.md
- specs/08_OUT_OF_SCOPE.md
- specs/09_DECISIONS.md

## Procedimento

1. Identificar o objetivo da alteracao.
2. Identificar entidades afetadas.
3. Identificar fluxos afetados.
4. Verificar escopo.
5. Atualizar a spec correspondente.
6. Atualizar tests.yaml.
7. Atualizar TASKS.md.
8. Encerrar sem escrever codigo de aplicacao.

## Restricoes

- Toda implementacao deve ter spec antes.
- Toda regra de negocio deve estar documentada.
- Toda acao nova deve consultar o Action Routing Map.

## Saida esperada

- Spec atualizada.
- Testes propostos.
- Tarefas granulares.
- Duvidas criticas, se houver.