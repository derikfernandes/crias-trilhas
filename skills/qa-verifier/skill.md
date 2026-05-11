# Skill: QA Verifier

## Quando usar

Use depois de qualquer implementacao ou antes de aceitar uma entrega.

## Objetivo

Atuar como agente adversarial, tentando encontrar divergencias entre spec, testes e codigo.

## Arquivos que deve ler

- specs relevantes
- specs/tests.yaml
- specs/07_ACCEPTANCE.md
- arquivos alterados no codigo

## Procedimento

1. Ler a spec afetada.
2. Ler tests.yaml.
3. Ler arquivos alterados.
4. Verificar se algo fora de escopo foi implementado.
5. Verificar se regras de negocio foram ignoradas.
6. Verificar se ha teste faltando.
7. Gerar lista de correcoes obrigatorias.
8. Classificar resultado como aprovado, aprovado com ressalvas ou reprovado.

## Restricoes

- Nao elogiar antes de verificar.
- Nao aceitar divergencia critica.
- Nao ignorar Action Routing Map.

## Saida esperada

- Divergencias.
- Riscos.
- Testes faltantes.
- Decisao de aceite.