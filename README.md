Copyright (c) 2026 Lacus Solutions

# Lacus CRM

CRM web pessoal de prospecção da Lacus Solutions (Curitiba/PR). Reúne leads (importados da planilha ou criados pela rotina de prospecção), funil de negociações, lembretes sincronizados com o Google Calendar, follow-ups que **nunca enviam nada sozinhos**, fila de prospecção e acesso por MCP e REST. É um app de um único usuário (o dono), instalável como PWA.

Especificação em `docs/SPEC.md`; decisões e desvios por fase em `docs/DECISIONS.md` e `docs/PLAN.md`; design em `DESIGN.md`.

## Requisitos

Node 24, Bun 1.4 e Docker (Postgres 17 local).

## Rodando localmente

```bash
bun install
docker compose up -d            # Postgres em localhost:54329
cp .env.example .env.local      # preencha (veja abaixo)
bun run db:migrate
bun run db:seed
bun run dev                        # http://localhost:3000
```

O `bun run dev` (e o `bunx next dev`) **avisa** no terminal quando há migrations pendentes (`[db] N migrations pendentes… Rode bun run db:migrate`); ele não migra sozinho nem trava a subida, e fica quieto com o banco em dia. Em produção, as migrations são aplicadas no build (`docs/DEPLOY.md`, passo 4).

### Variáveis de ambiente (`.env.local`)

Gere `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) e `CRON_SECRET` (`openssl rand -hex 24`). `DATABASE_URL=postgres://lacus:lacus@localhost:54329/lacus_crm` para o Docker local. O app valida tudo no boot (`src/lib/env.ts`) e diz o que falta. A lista completa, por ambiente, está em `docs/DEPLOY.md`.

### Login com Vercel (precisa de você)

1. No painel da Vercel, crie um app em Settings > Apps (Sign in with Vercel) chamado **Lacus CRM**.
2. Callback: `http://localhost:3000/api/auth/callback/vercel`. Escopos: `openid email profile`.
3. Copie o Client ID e o Client Secret para `VERCEL_CLIENT_ID` e `VERCEL_CLIENT_SECRET`.
4. Entre uma vez: em dev, o acesso negado mostra o `sub` recebido. Coloque-o em `OWNER_VERCEL_USER_ID` (ou, como alternativa, o e-mail verificado em `OWNER_EMAIL`) e entre de novo.

### Nichos e dados reais

O seed lê `.data/nichos.csv` (fora do git), exportado da aba "Nichos" da planilha; sem o arquivo, a etapa é ignorada. Os demais CSVs também ficam em `.data/`. `bun run db:import` importa na ordem nichos, cidades, fila, leads, top leads e uso da API; é idempotente e grava `.data/import-report.json` e `.data/dnc-candidates.md` (candidatos a "Não contatar", **nunca aplicados**). Na interface: `/leads/importar` e **Exportar** na tela de leads.

## Scripts

| Script                                          | O que faz                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bun run dev` / `build` / `start`               | Next.js (Turbopack)                                                                                                    |
| `bun run check`                                 | typecheck + lint + testes unitários                                                                                    |
| `bun run test:int`                              | integração num banco `<nome>_test` (criado e migrado sozinho)                                                          |
| `bun run e2e`                                   | Playwright (desktop e Pixel 7) contra `next dev`, num banco `<nome>_e2e` **recriado a cada execução** (nunca o de dev) |
| `bun run e2e:pwa`                               | PWA, painel e MCP contra o build de produção (porta 3101), também no banco `<nome>_e2e`                                |
| `bun run db:generate`                           | gera migration do schema Drizzle                                                                                       |
| `bun run db:migrate` / `db:rollback [n\|all]`   | aplica (sob advisory lock, numa transação) / desfaz migrations (`drizzle/down/*.down.sql`)                             |
| `bun run db:status [--quiet] [--strict]`        | diz se o banco está atrás das migrations do repositório (`--strict` sai com 1 se houver pendentes)                     |
| `bun run db:seed`                               | seeds idempotentes                                                                                                     |
| `bun run db:import [--insert-only] [--dry-run]` | importa os CSVs de `.data/`                                                                                            |
| `bun run icons`                                 | regenera os ícones em `public/brand`                                                                                   |

Commits seguem Conventional Commits (commitlint + husky). Atalho no app: `Ctrl+K` / `⌘K` abre a paleta (busca de leads e ações rápidas) no desktop.

## Mapa da arquitetura

| Pasta                                   | O que tem                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/`                        | telas protegidas: painel, leads, funil, lembretes, fila, configurações, design system                   |
| `src/app/api/`                          | `auth` (Better Auth), `mcp` e `mcp/prospecting` (MCP), `v1` (REST + OpenAPI), `jobs`, `google`, `leads` |
| `src/app/.well-known/`                  | metadados OAuth do MCP (RFC 8414 e 9728)                                                                |
| `src/lib/services/`                     | **toda a regra de negócio**; Server Actions, REST e MCP são adaptadores finos                           |
| `src/lib/api/`                          | `ops.ts`: operações compartilhadas por MCP e REST; `rest.ts`: rotas, auth de PAT e OpenAPI              |
| `src/lib/auth/`, `src/proxy.ts`         | Better Auth (Vercel + OAuth do MCP), DAL `requireOwner`, CSP e checagem otimista de sessão              |
| `src/lib/db/`, `drizzle/`               | schema Drizzle, migrations e `down/` para rollback                                                      |
| `src/lib/followups/`, `src/lib/google/` | motor de regras e dias úteis; Google Calendar (outbox)                                                  |
| `src/components/`                       | UI por área; `src/components/ui` são os primitivos do design system                                     |
| `tests/`                                | `unit`, `int` (banco `_test`), `e2e` e `pwa` (banco `_e2e`)                                             |

## Documentação

- `docs/DEPLOY.md`: checklist de produção, variáveis por ambiente, DNS, callbacks, Google, Schedule e smoke pós-deploy.
- `docs/OPERATIONS.md`: PWA, MCP e REST (exemplos `claude mcp add` e `curl`).
- `docs/ROTINA.md`: conectores do claude.ai e o prompt da rotina agendada.
- `docs/GOOGLE.md`: configuração do Google Calendar.
- `docs/DECISIONS.md`: decisões e desvios de cada fase.
