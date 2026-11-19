Copyright (c) 2026 Lacus Solutions

# Lacus CRM

CRM web pessoal de prospecção da Lacus Solutions (Curitiba/PR): leads, funil, lembretes no Google Calendar, follow-ups que nunca enviam nada sozinhos e acesso por MCP/REST. Especificação em `docs/SPEC.md`, decisões e desvios em `docs/PLAN.md` e `docs/DECISIONS.md`, design em `DESIGN.md`.

Estado: **fase 1** (fundação, auth, banco). Leads, funil, lembretes, dashboard, PWA e MCP chegam nas fases 2 a 8.

## Requisitos

Node 24, pnpm 12 e Docker (Postgres 17 local).

## Rodando localmente

```bash
pnpm install
docker compose up -d            # Postgres em localhost:54329
cp .env.example .env.local      # preencha (veja abaixo)
pnpm db:migrate
pnpm db:seed
pnpm dev                        # http://localhost:3000
```

### Variáveis de ambiente (`.env.local`)

Gere `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) e `CRON_SECRET` (`openssl rand -hex 24`). `DATABASE_URL=postgres://lacus:lacus@localhost:54329/lacus_crm` para o Docker local. O app valida tudo no boot (`lib/env.ts`) e diz o que falta.

### Login com Vercel (precisa de você)

1. No painel da Vercel, crie um app em Settings > Apps (Sign in with Vercel) chamado **Lacus CRM**.
2. Callback: `http://localhost:3000/api/auth/callback/vercel`. Escopos: `openid email profile`.
3. Copie o Client ID e o Client Secret para `VERCEL_CLIENT_ID` e `VERCEL_CLIENT_SECRET`.
4. Entre uma vez: em dev, o acesso negado mostra o `sub` recebido. Coloque-o em `OWNER_VERCEL_USER_ID` (ou, como alternativa, o e-mail verificado em `OWNER_EMAIL`) e entre de novo.

### Nichos

O seed lê `.data/nichos.csv` (fora do git) exportado da aba "Nichos" da planilha. Sem o arquivo, a etapa é ignorada.

### Dados reais (fase 2)

Os CSVs ficam em `.data/` (fora do git), gerados a partir da planilha por leitura. `pnpm db:import` importa na ordem nichos, cidades, fila, leads, top leads e uso da API, é idempotente e grava `.data/import-report.json` e `.data/dnc-candidates.md` (candidatos a "Não contatar", **nunca aplicados**). Na interface: `/leads/importar` (mapeamento, simulação, relatório e confirmação) e **Exportar** na tela de leads.

## Scripts

| Script                                       | O que faz                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`               | Next.js (Turbopack)                                                                 |
| `pnpm check`                                 | typecheck + lint + testes unitários                                                 |
| `pnpm test:int`                              | integração num banco `<nome>_test` do Postgres do Docker (criado e migrado sozinho) |
| `pnpm e2e`                                   | Playwright (desktop e Pixel 7); usa a rota de bypass com `E2E_AUTH_BYPASS=1`        |
| `pnpm db:generate`                           | gera migration do schema Drizzle                                                    |
| `pnpm db:migrate` / `db:rollback [n\|all]`   | aplica / desfaz migrations (`drizzle/down/*.down.sql`)                              |
| `pnpm db:seed`                               | seeds idempotentes                                                                  |
| `pnpm db:import [--insert-only] [--dry-run]` | importa os CSVs de `.data/` (nichos, cidades, fila, leads, top leads, uso da API)   |
| `pnpm icons`                                 | regenera os ícones em `public/brand`                                                |

Commits seguem Conventional Commits (commitlint + husky).

## Antes de migrar produção

Crie um branch de backup no Neon (painel do Neon > Branches > Create branch a partir de main) antes de rodar `pnpm db:migrate`.
