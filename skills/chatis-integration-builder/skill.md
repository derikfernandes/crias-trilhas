# Skill: Chatis Integration Builder

## Quando usar

Use para desenhar ou alterar fluxos que serao consumidos pelo Chatis.

## Objetivo

Garantir que o fluxo conversacional consiga consultar aluno, trilha, stage, tipo de stage e proximo conteudo.

## Arquivos que deve ler

- specs/04_API_CONTRACT.md
- specs/05_ACTION_ROUTING_MAP.md
- specs/06_CHATIS_INTEGRATION.md
- specs/tests.yaml

## Procedimento

1. Identificar entrada esperada pelo Chatis.
2. Identificar endpoint usado.
3. Identificar resposta esperada.
4. Validar avanco de stage/question.
5. Validar liberacao.
6. Validar tipo do stage.
7. Criar exemplos de payload.
8. Atualizar testes de integracao.

## Restricoes

- Nao depender de estado implicito no chat.
- Toda decisao de proximo passo deve vir da API.
- Se nao houver proximo conteudo, retornar status de conclusao.

## Saida esperada

- Contrato Chatis atualizado.
- Payloads de exemplo.
- Testes de fluxo conversacional.