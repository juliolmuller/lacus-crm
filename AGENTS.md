<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lacus CRM — agent guide

Single-user prospecting CRM for Lacus Solutions (pt-BR only): Next.js 16 App Router on Vercel, Postgres through Drizzle (Neon in production, Docker locally), Better Auth (Sign in with Vercel plus OAuth for MCP), Google Calendar sync, an installable PWA, and MCP + REST access. This file is the single source of project rules for every agent (Claude Code reads it via `CLAUDE.md`).

## Read before you change things

| You are touching…                            | Read                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Anything architectural, or a past choice     | [docs/DECISIONS.md](docs/DECISIONS.md) (wins over SPEC and PLAN), then the README map |
| Product intent, scope, data model            | [docs/SPEC.md](docs/SPEC.md) and [docs/PLAN.md](docs/PLAN.md)                         |
| UI, tokens, components                       | [DESIGN.md](DESIGN.md) and `/design-system` in the running app                        |
| Env vars, Vercel, DNS, Schedule, production  | [docs/DEPLOY.md](docs/DEPLOY.md)                                                      |
| PWA, MCP, REST, tokens                       | [docs/OPERACAO.md](docs/OPERACAO.md)                                                  |
| Google Calendar                              | [docs/GOOGLE.md](docs/GOOGLE.md)                                                      |
| The claude.ai prospecting routine, the queue | [docs/ROTINA.md](docs/ROTINA.md)                                                      |

## Commands (Bun 1.4 installs and orchestrates; Node 24 runs Next, Vitest, Playwright and Drizzle Kit)

```sh
bun install && docker compose up -d && cp .env.example .env.local
bun run db:migrate && bun run db:seed && bun run dev
bun run lint && bun run typecheck && bun run test
bun run test:int                     # own `<db>_test` database
bun run e2e && bun run e2e:pwa       # own `<db>_e2e` database, recreated every run
```

Run the relevant gates before saying something works; never claim an unrun check passed. Always `bun run <script>`: `bun test` and `bun build` are Bun's own commands, not this project's scripts.

## Rules

**Code**

- TypeScript only, `strict` + `noUncheckedIndexedAccess`. No `any`, no `@ts-ignore`, no disabled lint rule without a `-- reason` comment.
- Formatting and linting come from `eslint-config-any` (Prettier embedded; no Prettier config in the repo). `bun run lint` allows zero warnings. Explicit return types everywhere except `src/lib/services`, `src/lib/db`, `src/lib/auth` and `tests`, where Drizzle and Better Auth inference is the contract.
- Server Components by default; `'use client'` only on interactive leaves. Never use deprecated Next APIs (`middleware.ts` is `src/proxy.ts`).
- Named exports (default only where Next requires). kebab-case filenames. Tests live in `tests/{unit,int,e2e,pwa}`.

**Data layer**

- Business rules live in `src/lib/services/`. Server Actions, REST (`src/lib/api`) and MCP (`src/lib/mcp`) are thin adapters over the same services and the shared ops in `src/lib/api/ops.ts`.
- Every schema change is a Drizzle migration plus its rollback in `drizzle/down/`; CI runs migrate, rollback all, migrate.
- Tests and e2e never touch the dev database: integration uses `<db>_test`, e2e uses `<db>_e2e`. Real data stays in `.data/` (out of git); fixtures are fictional.
- Follow-ups never send anything on their own: they create reminders and suggestions the owner acts on. "Não contatar" candidates are reported, never applied automatically.

**UI and accessibility**

- Every user-facing string is Brazilian Portuguese, natural and direct.
- Tokens from `src/app/globals.css` (Tailwind v4 `@theme`), primitives from `src/components/ui`. Dark is the default; light comes from `data-theme="light"`.
- WCAG 2.2 AA: 44 px touch targets, visible focus ring, information never conveyed by color alone, `prefers-reduced-motion` honored. Verify with `@axe-core/playwright` (zero violations).

**Security and privacy**

- One user: every protected page, Server Action and Route Handler checks the owner (`requireOwner` in `src/lib/auth/dal.ts`); never rely on the proxy alone. REST takes PATs; MCP takes PATs or OAuth tokens, with `/api/mcp/prospecting` exposing only the routine's tools.
- Secrets are never `NEXT_PUBLIC_`, never imported by client code, never printed in logs, tests or errors. Google tokens are stored encrypted.
- zod at every boundary (forms, REST, MCP, CSV import).

## Working agreement

- **Decide and document** instead of asking, unless blocked. Record non-obvious decisions in `docs/DECISIONS.md` under the right section (context → decision → consequence); mark replaced ones superseded, never delete them.
- **Docs ship with the change.** Behavior, env var, script, CI or setup changes update the matching doc in the same commit. Docs are written in Brazilian Portuguese.
- **Git flow.** `main` is production (every push deploys on Vercel and runs semantic-release); `next` is the integration branch, where Dependabot and `@claude:next` issues land. Branch from the target branch and open the PR against it.
- Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`, `ci:`, `test:`…), subject in Brazilian Portuguese, small and focused. Husky runs lint-staged on commit, commitlint on commit-msg and typecheck on push. Never commit secrets or `.env*` (only `.env.example`).
- Keep the `BEGIN/END:nextjs-agent-rules` block above intact; `next dev` re-adds it.
