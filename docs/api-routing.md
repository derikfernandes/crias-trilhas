# API Routing — Crias Trilhas

## Regra central

```text
Painel Admin -> Firestore Client SDK
Chatis -> API HTTP
Integracoes externas -> API HTTP
```

## Painel Admin

O painel atual usa Firestore diretamente.

Exemplos:

- Instituicoes: collection `institutions`.
- Alunos: collection `students`.
- Trilhas: collection `trails`.
- Stages: collection `trail_stages`.
- Conteudos: collection `trail_stage_questions`.

## Chatis

O Chatis deve usar API HTTP.

Endpoints necessarios:

### Buscar aluno por telefone

```text
GET /student/by-phone/{phone_number}
```

### Buscar proximo conteudo

```text
GET /student_trails/next-content?student_id={student_id}&trail_id={trail_id}
```

### Avancar aluno

```text
POST /student_trails/advance
```

### Consultar status

```text
GET /student_trails/status?student_id={student_id}&trail_id={trail_id}
```

## Variaveis de ambiente

Nome sugerido para base URL:

```text
VITE_API_BASE_URL
```

Header sugerido:

```text
Authorization: Bearer <token>
```

## Observacao

A existencia de um endpoint na documentacao nao significa que ele ja esteja implementado.

Antes de usar endpoint em producao, validar:

- host real;
- autenticacao;
- payload;
- resposta;
- tratamento de erro;
- logs.