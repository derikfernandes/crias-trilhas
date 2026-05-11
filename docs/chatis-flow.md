# Chatis Flow — Crias Trilhas

## 1. Objetivo

Este documento explica como o Chatis deve conversar com o Crias Trilhas.

O Chatis deve consumir API HTTP, nao Firestore direto.

## 2. Fluxo basico

```text
1. Usuario manda mensagem no WhatsApp.
2. Chatis captura telefone.
3. Chatis busca aluno por telefone.
4. API retorna aluno.
5. Chatis busca proximo conteudo.
6. API retorna stage, question, tipo e conteudo.
7. Chatis entrega conteudo.
8. Chatis chama endpoint de avancar.
```

## 3. Buscar aluno

Endpoint:

```text
GET /student/by-phone/{phone_number}
```

Resposta esperada:

```json
{
  "status": "ok",
  "student_id": "s1",
  "institution_id": "inst_1",
  "name": "Joao",
  "active": true
}
```

## 4. Buscar proximo conteudo

Endpoint:

```text
GET /student_trails/next-content?student_id=s1&trail_id=t1
```

Resposta esperada:

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

## 5. Regras por tipo

### fixed

Enviar `content` diretamente.

### ai

Enviar para o modelo usando:

- `prompt`;
- `content`;
- contexto do aluno, se disponivel.

### exercise

Enviar exercicio.

Se houver `options`, mostrar alternativas.
Se nao houver `options`, enviar o texto de `content`.

## 6. Avancar

Endpoint:

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

Resposta:

```json
{
  "status": "ok",
  "next_stage_number": 2,
  "next_question_number": 1,
  "completed": false
}
```

## 7. Erros

- `not_found`: aluno nao encontrado.
- `inactive_student`: aluno inativo.
- `inactive_trail`: trilha inativa.
- `blocked`: conteudo nao liberado.
- `completed`: trilha concluida.

## 8. Regra de ouro

A logica de progressao deve estar na API, nao no fluxo do Chatis.