# Domain Model — Crias Trilhas

## 1. Institution

Representa uma organização que usa o Crias.

Campos:

- `id`: identificador do documento.
- `name`: nome da instituição.
- `type`: tipo da instituição.
- `active`: indica se a instituição está ativa.
- `public_link`: URL pública salva no Firestore.
- `created_at`: data de criação.
- `updated_at`: data de atualização.

Regras:

- Toda trilha deve pertencer a uma instituição.
- Todo aluno deve pertencer a uma instituição.
- Instituições inativas não devem aparecer como opção principal de cadastro.

## 2. Student

Representa um aluno.

Campos:

- `id`: identificador do documento.
- `institution_id`: instituição vinculada.
- `name`: nome do aluno.
- `phone_number`: telefone normalizado.
- `school_level`: nível escolar, como fundamental ou médio.
- `school_grade`: série/ano escolar.
- `student_level`: nível pedagógico atual, 1, 2 ou 3.
- `active`: indica se o aluno está ativo.
- `created_at`: data de criação.
- `updated_at`: data de atualização.

Regras:

- `phone_number` deve ser normalizado apenas com números.
- `student_level` deve ser 1, 2 ou 3.
- Se `student_level` não for informado, usar 2.
- Aluno inativo não deve avançar em trilhas.

## 3. Trail

Representa uma trilha pedagógica.

Campos:

- `id`: identificador da trilha.
- `institution_id`: instituição dona da trilha.
- `name`: nome da trilha.
- `description`: descrição geral.
- `subject`: matéria ou tema.
- `default_total_steps_per_stage`: quantidade total de fases/stages.
- `active`: indica se a trilha está ativa.
- `phase_blueprint`: estrutura de fases usada na criação.
- `created_at`: data de criação.
- `updated_at`: data de atualização.

Regras:

- Trilha deve ter instituição.
- Trilha deve ter nome.
- Trilha deve ter matéria.
- Trilha deve ter descrição.
- `default_total_steps_per_stage` deve refletir a quantidade de fases.
- Trilha inativa não deve ser entregue ao aluno.

## 4. TrailStage

Representa uma fase da trilha.

Campos:

- `id`: identificador do stage.
- `trail_id`: trilha vinculada.
- `stage_number`: posição sequencial dentro da trilha.
- `title`: nome da fase.
- `stage_type`: tipo da fase.
- `prompt`: comando de IA quando aplicável.
- `is_released`: indica se a fase está liberada.
- `active`: indica se a fase está ativa.
- `created_at`: data de criação.
- `updated_at`: data de atualização.

Tipos aceitos:

- `ai`
- `fixed`
- `exercise`

Regras:

- `stage_type = ai` exige `prompt` preenchido.
- `stage_type = fixed` deve ter `prompt = null`.
- `stage_type = exercise` deve ter `prompt = null`.
- `stage_number` deve ser sequencial dentro da trilha.
- Stage não liberado não deve ser entregue ao aluno.

## 5. TrailStageQuestion

Representa o conteúdo entregue em determinada fase e questão.

Campos:

- `id`: identificador do conteúdo.
- `trail_id`: trilha vinculada.
- `stage_number`: fase vinculada.
- `question_number`: posição horizontal da trilha.
- `title`: título do conteúdo.
- `content`: conteúdo principal.
- `correct_option`: alternativa correta, quando aplicável.
- `options`: opções de exercício, quando aplicável.
- `explanation`: explicação, quando aplicável.
- `is_released`: indica se o conteúdo está liberado.
- `active`: indica se o conteúdo está ativo.
- `created_at`: data de criação.
- `updated_at`: data de atualização.

Regras:

- O comportamento fica em `trail_stages`.
- O conteúdo sequencial fica em `trail_stage_questions`.
- `question_number` representa a progressão horizontal da trilha.
- Conteúdo não liberado não deve ser entregue ao aluno.