# Plano: Lacus CRM (`~/crm`)

## Contexto

Hoje a prospecção da Lacus Solutions roda em Google Sheets, alimentada por uma rotina do Claude a cada 2 h. O Lacus CRM substitui as abas Leads, Top leads, Fila, Cidades, Uso da API e Nichos e passa a ser o destino da rotina. É um app web (PWA) de um único usuário: dashboard, leads, funil kanban, lembretes no Google Calendar, follow-ups automáticos que nunca enviam nada sozinhos, e acesso por MCP e REST. A especificação completa é o prompt do Júlio (seções 1–15). Este plano registra só as decisões tomadas, os desvios da especificação e a execução por fases. Onde não diz nada, vale o prompt.

Repositório: `~/crm` (vazio hoje) → `git init`, pacote `lacus-crm`, pnpm.

## Respostas da seção 16 (fase 0)

| #   | Pergunta                   | Decisão                                                                                                                                                                                                             |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Domínio                    | `lacuscrm.juliolmuller.com` (callbacks Vercel e Google apontam para ele)                                                                                                                                            |
| 2   | Deployment Protection      | **Standard**. Produção protegida só pelo login do app, sem header de bypass                                                                                                                                         |
| 3   | Status e funil             | `contact_status` aprovado como está. **Funil alterado** (ver abaixo)                                                                                                                                                |
| 4   | "Descartado" na importação | Vira `discarded`. `do_not_contact` só para uma lista gerada pelo importador (observação com recusa) e confirmada pelo Júlio                                                                                         |
| 5   | Orçamento da Places API    | **Só alerta**: o upsert sempre grava, a rotina aborta pelo `remaining`, e o dashboard mostra o estouro. Valor inicial de `places_daily_budget` = 150/dia, editável em Configurações (**o Júlio confirma o número**) |
| 6   | Rotina                     | **Tarefa agendada no claude.ai** → exige MCP com OAuth (ver desvio D1)                                                                                                                                              |
| 7   | Calendar                   | Gmail pessoal. Lembrete concluído ou cancelado **apaga** o evento                                                                                                                                                   |
| 8   | Dados reais                | Leio a planilha pelo conector do Google Sheets (somente leitura) e gravo CSVs em `~/crm/.data/` (fora do git). Se a aba Leads for grande demais para transcrever, peço o download em CSV                            |
| —   | Etapa ↔ status             | Sincronizar **só para frente** (ver D3)                                                                                                                                                                             |
| —   | Top leads                  | Entram no funil na importação, na etapa que corresponde ao status                                                                                                                                                   |

## Desvios da especificação (vão para `docs/DECISIONS.md`)

**D1. MCP com OAuth entra no v1.** Conectores do claude.ai não mandam header Bearer fixo, então o PAT sozinho não atende a rotina. Uso `@better-auth/mcp` (que já existe e se apoia no Better Auth que vamos usar): o app vira o servidor de autorização OAuth 2.1, com metadata RFC 9728, CIMD e DCR como fallback. O login continua sendo o Sign in with Vercel, e a allowlist do dono vale também para a tela de consentimento.

- `/api/mcp` aceita os dois: o **PAT** (Claude Code, curl, REST) e o **token OAuth** (claude.ai). O `verifyToken` tenta o hash do PAT primeiro e depois o token OAuth.
- **Menor privilégio para a rotina**: uma segunda rota, `/api/mcp/prospecting`, expõe só as ferramentas `queue_*`, `api_usage_*`, `crm_upsert_leads`, `niches_list` e `regions_list`. O Júlio cadastra no claude.ai um conector separado para ela, e a rotina usa só esse conector.
- Na fase 7, confirmo se o transporte fica com `mcp-handler` 2.4 ou com o `createMcpHandler` do `@modelcontextprotocol/server` v2 (`legacy: "reject"`), que é o que a doc do `@better-auth/mcp` recomenda. Também confirmo que tarefas agendadas do claude.ai enxergam conectores customizados.

**D2. Funil novo** (seed de `deal_stages`):

| key           | Etapa          | Cor        | Prob. | `lead_status` ➕ |
| ------------- | -------------- | ---------- | ----- | ---------------- |
| `to_diagnose` | A diagnosticar | stage-1    | 5%    | `to_contact`     |
| `to_contact`  | A abordar      | stage-2    | 10%   | `to_contact`     |
| `contacted`   | Abordado       | stage-3    | 20%   | `contacted`      |
| `talking`     | Em conversa    | stage-4    | 35%   | `replied`        |
| `negotiating` | Em negociação  | stage-5    | 60%   | `negotiating`    |
| `won`         | Ganho          | stage-won  | 100%  | `client`         |
| `lost`        | Perdido        | stage-lost | 0%    | `lost`           |

As probabilidades são um palpite meu e ficam editáveis. Sem a etapa "Proposta enviada", a cadência de proposta passa a disparar por **interação do tipo `proposal`**. Para isso entra a coluna ➕ `followup_rules.interaction_type`. O critério de aceite da fase 4 vira: "registrar uma interação Proposta cria 3 lembretes nas datas úteis certas (com feriado no meio)".

**D3. Sincronia entre etapa e status (só para frente).**

- ➕ `deal_stages.lead_status`: entrar numa etapa define o `contact_status` do lead, mas só se ele avançar na ordem (`new < to_contact < contacted < no_response < replied < negotiating < client`). `lost`, `client` e `discarded` são sempre aplicados.
- Isso **substitui** a regra "deal criado → `negotiating`" da seção 11.
- A 1ª interação outbound move o deal aberto de `to_diagnose`/`to_contact` para `contacted`. Uma interação inbound move para `talking`, se o deal ainda estiver antes dessa etapa. Os dois casos gravam `deal_stage_history.source='rule'`.

**D4. Top leads**: cada um que não tem deal aberto ganha um deal na etapa equivalente ao status (`new`/`to_contact` → A diagnosticar, `contacted` → Abordado e assim por diante).

**D5. DnD**: `@dnd-kit/react` está em 0.5.3 (< 1.0), então uso `@dnd-kit/core` + `@dnd-kit/sortable`, como manda a regra da 6.3.

**D6. Convenções do repo `lacus.solutions` reaproveitadas**: commitlint com a mesma `type-enum` (inclui `ai`), husky e lint-staged. Fico com o pnpm, como manda a spec, embora o outro repo use bun.

## Versões conferidas hoje (19/11/2026, `npm view`)

next 16.4.6 · better-auth 1.7.26 (+ `@better-auth/mcp`) · drizzle-orm 0.45.4 / drizzle-kit 0.31.11 · @neondatabase/serverless 1.2.1 · mcp-handler 2.4.0 · @modelcontextprotocol/server 2.4.0 · @dnd-kit/core 6.3.1 · @serwist/turbopack 9.5.15 · zod 4.6.7 · nuqs 2.10.3 · @tanstack/react-table 9.3.1 · react-virtual 3.14.26 · fractional-indexing 4.0.0 · tailwindcss 4.3.5 · vitest 5.1.1 · @playwright/test 1.65.1 · google-auth-library 11.3.4. Antes de cada instalação, leio a doc atual (Context7) e confiro peer deps.

## Arquitetura (resumo)

- A estrutura de pastas é a da seção 12. Toda regra de negócio fica em `src/lib/services/*`, e as Server Actions, o REST (`/api/v1`) e o MCP são adaptadores finos (Zod + `audit_log`).
- Funções puras com teste unitário: `computeScore`, `addBusinessDays`, motor de regras (`src/lib/rules`), renderização de modelos, normalização de telefone e nome, parser de "Cidade / bairro", mapeamento CSV, cifra AES-GCM, hash de PAT.
- Banco: Postgres 17 em Docker para dev e testes (o Docker já está instalado) e Neon em preview e produção. `src/lib/db/index.ts` escolhe o driver pela URL.
- Triggers (`do_not_contact`, `lead_id` do lembrete, `updated_at`) ficam numa migration custom, e cada migration tem um `.down.sql` escrito à mão.

## Fases

Cada fase termina com `pnpm check` (typecheck + lint + unit) e os e2e da fase passando, commits pequenos em Conventional Commits e um relatório com o que foi entregue, como testar e o que ficou pendente. Sem push nem deploy até o Júlio pedir.

| #   | Fase                              | Notas além da seção 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fundação + auth + banco           | Scaffold, tokens (7.1–7.2), shell, marca e ícones (`scripts/generate-icons.ts`), rodapé ©. Schema completo com os acréscimos D2/D3, triggers, down migrations e `db:rollback`. Seeds: etapas D2, settings, regras e modelos da seção 11 adaptados a D2, e os **18 nichos lidos da aba Nichos** via Sheets. Better Auth + Vercel + allowlist, `proxy.ts`, DAL, `/design-system` inicial e CI. **Bloqueios do Júlio**: criar o Vercel App (client ID/secret, callback local) e informar `OWNER_EMAIL` |
| 2   | Leads                             | Tudo da 6.2. Importadores leem os CSVs de `.data/` (gerados pelo conector Sheets). Top leads cria os deals (D4). A lista de candidatos a `do_not_contact` sai em relatório para confirmação                                                                                                                                                                                                                                                                                                         |
| 3   | Funil + interações                | Board das 7 etapas D2, sincronia D3, ganho/perda, histórico, teclado e toque                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | Lembretes + Calendar + follow-ups | Critério de proposta ajustado (D2). Concluir ou cancelar apaga o evento. Schedule horário 7h–21h com fallback no cron diário. **Bloqueio**: OAuth client do Google (passo a passo em `docs/GOOGLE.md`)                                                                                                                                                                                                                                                                                              |
| 5   | Dashboard                         | Conversão por etapa sobre as etapas D2                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | PWA                               | Seção 8 sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | MCP/API + Fila                    | PAT + OAuth (D1), `/api/mcp/prospecting`, `/api/v1` + OpenAPI e tela da Fila. `docs/ROTINA.md` com o prompt da tarefa agendada no claude.ai e o passo de cadastrar os dois conectores. Teste: o fluxo claim → upsert → usage → complete roda 2× com o mesmo `runId` sem duplicar, tanto com PAT quanto com OAuth                                                                                                                                                                                    |
| 8   | Polimento + deploy                | Checklist com `lacuscrm.juliolmuller.com`: DNS, callbacks, Google publicado "In production", Schedule ativo e conectores do claude.ai                                                                                                                                                                                                                                                                                                                                                               |

## Verificação ponta a ponta

- **Unit/integração**: `pnpm check` e `pnpm test:int` (Postgres em Docker, cada teste numa transação revertida). Casos obrigatórios: score = 85, feriados móveis de 2026/27, idempotência do upsert e das regras, triggers.
- **E2E**: `pnpm e2e` (Playwright desktop, iPhone 14 e Pixel 7, com axe nos dois temas), usando a rota de bypass só com `E2E_AUTH_BYPASS=1` fora da produção.
- **Manual com o Júlio**: login Vercel em localhost; conta fora da allowlist recusada; evento criado, alterado e apagado no Calendar; `claude mcp add` com PAT; conector OAuth no claude.ai listando ferramentas; uma execução real da rotina contra preview/produção; instalação da PWA em Android e iOS; Lighthouse.

## Riscos que o Júlio precisa saber

- **Plano Hobby da Vercel é para uso não comercial**. O CRM serve a uma atividade comercial. Vou conferir os termos atuais e registrar; pode ser preciso migrar para o Pro.
- **OAuth no MCP** (D1) aumenta a superfície de ataque. A mitigação é a allowlist no consentimento, o DCR desligado quando o CIMD bastar e a rota separada para a rotina.
- O orçamento de 150 req/dia é um chute meu. As cotas grátis da Places API (New) variam por SKU, e os campos de telefone, site e nota caem em SKUs mais caros. O Júlio confirma o número.
