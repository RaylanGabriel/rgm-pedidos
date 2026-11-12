# Lições

Padrões aprendidos com correções. Revisar no início de cada sessão.

## Git e branches

- **Arquivo commitado só na `main` some ao trocar para uma branch antiga.** (12/nov/2026: o `CLAUDE.md` foi commitado na
  `main` e sumiu da pasta ao voltar para `feat/cloudflare-workers`, que saiu da `main` antes dele.)
  Regra: depois de commitar algo na `main`, atualizar as branches abertas (`git rebase main` + `push --force-with-lease`)
  ou commitar arquivos de configuração do Claude (`CLAUDE.md`, `tasks/`) na branch em que se está trabalhando.
  Ao trocar de branch, conferir se `CLAUDE.md` continua na pasta.

## Segredos

- **Nunca "mascarar" segredo com filtro de texto (regex) na saída de um comando.** (11/nov/2026: um filtro falhou com
  aspas escapadas e o token do Blob apareceu inteiro. 12/nov/2026: de novo — `vercel curl --debug` imprimiu o segredo de
  bypass dos previews numa linha que o filtro não previa.) Regra: mostrar só nome, tamanho ou hash.
  **Nunca rodar comandos com `--debug`/verbose de CLIs autenticadas (vercel, wrangler, neonctl) mostrando a saída.**
  Se precisar diagnosticar, filtrar por lista do que é seguro mostrar (ex.: só `Target URL`), nunca por lista do que esconder.

## Windows / Git Bash

- Caminhos que começam com `/` viram caminho do Windows no Git Bash (`/loja` → `C:/Program Files/Git/loja`).
  Regra: usar `MSYS_NO_PATHCONV=1` em comandos que recebem caminhos de URL (`vercel curl`, `vercel api`).
- **Nunca publicar na Cloudflare um build feito nesta máquina.** O OpenNext copia os valores do `.env.local` para dentro
  do Worker. Deploy só via push (Workers Builds).
