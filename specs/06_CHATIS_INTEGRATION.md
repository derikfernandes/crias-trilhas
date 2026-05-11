# Integração Chatis — Crias Trilhas

## 1. Objetivo

Permitir que o Chatis consulte o estado do aluno e entregue o próximo conteúdo da trilha.

O Chatis não deve decidir sozinho a regra de negócio. Ele deve consultar a API, receber o próximo passo e executar a entrega conversacional.

## 2. Conceitos

### Stage

Representa a fase atual da pergunta.

Exemplo de estrutura:

1. Contexto
2. Introdução
3. Exemplo
4. Saiba Mais
5. Exercício 1
6. Exercício 2
7. Exercício 3
8. Final

### Question

Representa o avanço horizontal do conteúdo.

Exemplo:

- Questão 1 passa pelos stages 1 a 8.
- Depois, Questão 2 passa novamente pelos stages 1 a 8.

## 3. Regra de avanço

Se stage atual for menor que o total de stages:

```text
next_stage_number = current_stage_number + 1
next_question_number = current_question_number
```

Se stage atual for igual ao total de stages:

```text
next_stage_number = 1
next_question_number = current_question_number + 1
```

Se não houver próxima questão:

```text
completed = true
```

## 4. Validadores no Chatis

### Validator vazio

Verifica se o aluno existe e está vinculado a alguma instituição.

Entrada:

- telefone do usuário

API:

```text
GET /student/by-phone/{phone_number}
```

Possíveis saídas:

- `ok`
- `not_found`
- `inactive_student`

### Validator liberado

Verifica se o próximo conteúdo está liberado.

API:

```text
GET /student_trails/next-content?student_id={student_id}&trail_id={trail_id}
```

Possíveis saídas:

- `ok`
- `blocked`
- `completed`

### Validator tipo de stage

Verifica como o Chatis deve tratar o conteúdo.

Tipos:

- `ai`: enviar conteúdo/prompt para o modelo.
- `fixed`: entregar texto fixo.
- `exercise`: entregar exercício.

## 5. Resposta esperada para o Chatis

```json
{
  "status": "ok",
  "student_id": "s1",
  "trail_id": "t1",
  "stage_number": 1,
  "question_number": 1,
  "stage_type": "fixed",
  "prompt": null,
  "content": "Texto a ser entregue",
  "options": null,
  "explanation": null,
  "is_released": true,
  "next_action": "deliver_content"
}
```

## 6. Comportamento por stage_type

### `fixed`

Chatis deve enviar `content` diretamente ao aluno.

### `ai`

Chatis deve usar:

- `prompt` do stage;
- `content` da question;
- contexto do aluno, se disponível.

### `exercise`

Chatis deve entregar exercício.

Se `options` existir, entregar opções.
Se `options` for null, entregar o texto em `content`.

## 7. Avanço

Depois de entregar o conteúdo, o Chatis deve chamar:

```text
POST /student_trails/advance
```

Body:

```json
{
  "student_id": "s1",
  "trail_id": "t1"
}
```

## 8. Erros esperados

### `not_found`

Aluno não encontrado.

### `inactive_student`

Aluno está inativo.

### `inactive_trail`

Trilha está inativa.

### `blocked`

Conteúdo ainda não liberado.

### `completed`

Aluno concluiu a trilha ou não há próximo conteúdo.

## 9. Regra de ouro

O Chatis não deve guardar a lógica de progressão. A API deve retornar o próximo estado.