# Crias Trilhas · Redesign do painel da escola

Pacote de entrega do redesign: protótipos navegáveis, documentação de design, guia de implementação e imagens das telas.

## Conteúdo

| Arquivo / pasta | O que é |
| --- | --- |
| `README-IMPLEMENTACAO.md` | Guia para quem vai implementar (pessoa ou agente de IA). Comece por aqui. |
| `Crias Documentacao.dc.html` | Relatório de viabilidade: pronto, parcial, desenvolver; backlog; decisões pendentes |
| `Crias README Implementacao.dc.html` | Versão para impressão/PDF do guia de implementação |
| `Crias Visao Geral.dc.html` | Tela Visão geral (substitui /dashboard) |
| `Crias Trilhas.dc.html` | Lista e editor de trilhas (abas Geral, Atividades, Desempenho, Alunos) |
| `Crias Nova Trilha.dc.html` | Assistente de nova trilha |
| `Crias Alunos.dc.html` | Lista de alunos; `?aluno=1` abre o perfil |
| `Crias Configuracoes.dc.html` | Instituições, usuários e papéis, integração |
| `imagens/` | 13 capturas em página inteira, 2x (01 a 13, na ordem de navegação) |
| `assets/` | Logos Crias |
| `_ds/`, `support.js`, `doc-page.js` | Arquivos de suporte dos protótipos. Não editar. |

## Como abrir os protótipos

Os arquivos `.dc.html` precisam de um servidor local (abrir com duplo clique via `file://` bloqueia o carregamento de scripts):

```
cd crias-redesign
npx serve .
```

Depois acesse `http://localhost:3000/Crias%20Visao%20Geral.dc.html`. A navegação entre telas funciona pelos links do cabeçalho.

## Onde isso entra no repositório

Os protótipos são referência visual; não são código de produção. A implementação acontece em `crias-trilhas/frontend/trilha-admin/src/design/**`, seguindo `README-IMPLEMENTACAO.md` e as regras de `ARCHITECTURE_RULES.md`.

## Dados

Todos os números são fictícios e consistentes entre as telas (Instituto Sol, 612 alunos; aluna de referência Ana Beatriz Souza). Detalhes na seção 6 do guia.
