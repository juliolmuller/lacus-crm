# Especificação original: Lacus CRM

> Prompt original do Júlio (nov/2026), preservado como referência. As decisões tomadas na fase 0 e os desvios aprovados estão em `docs/PLAN.md`, e eles **prevalecem** sobre este documento onde houver conflito.

## 1. Contexto e objetivo

Você vai construir o **Lacus CRM**, um CRM web pessoal de prospecção, para o Júlio, freelancer de tecnologia em Curitiba/PR (Lacus Solutions), que vende sites para pequenos negócios de serviço (clínicas odontológicas, estética, advocacia etc., 18 nichos). Há **um único usuário** e nenhuma equipe.

Hoje a prospecção roda em Google Sheets. Uma rotina agendada do Claude roda a cada 2 h: lê a próxima combinação "Pendente" de uma fila (216 combinações = 12 regiões × 18 nichos), consulta a Google Places API (New), aplica os filtros de qualificação F0–F8 e grava até 20 leads por execução, cada um com um UUID v4. O app substitui as planilhas **Leads** (39 colunas por cidade), **Top leads**, **Fila**, **Cidades**, **Uso da API** e **Nichos**, e passa a ser o destino da rotina.

O que o app precisa fazer:

1. **Dashboard** com métricas de prospecção.
2. **Leads**: CRUD completo, busca, filtros, ordenação, importação e exportação de CSV.
3. **Funil** (kanban de negociações), com histórico de interações, lembretes e automação de follow-ups.
4. Lembretes com hora marcada no **Google Calendar**.
5. **PWA** instalável no celular.
6. **MCP + API REST** para o Júlio operar o CRM conversando com o Claude Code e para a rotina agendada gravar leads.
7. Design system dark-first, documentado e com guia vivo.

Regras de negócio que valem para o app inteiro:

- **LGPD**: os dados são B2B e públicos. O app registra a origem dos dados, respeita opt-out com `do_not_contact` e uma lista de supressão, e permite exportar e excluir um lead.
- **Nunca enviar mensagens sozinho.** O app ajuda a abordar um lead por vez: abre `wa.me` com o texto preenchido, copia o texto para a área de transferência e registra a interação. Não use API de WhatsApp, disparo em massa ou envio automático de e-mail ou DM.
- Cada lead guarda o link da sessão de conversa do Claude usada para planejar a abordagem (`session_url`).

### 1.1 Identidade do produto (marca)

- **Nome**: **Lacus CRM** (grafia exata, "Lacus" e não "LACUS"). Slug, repositório e pacote: `lacus-crm`. Use o nome no `<title>` (páginas: `Leads · Lacus CRM`), no manifest, na tela de login, no README, no nome do app OAuth da Vercel e na tela de consentimento do Google, no calendário "Lacus CRM – Follow-ups" e no servidor MCP (`lacus-crm`).
- **Titular**: **Lacus Solutions**.
  - **Rodapé de copyright**: `© {ano} Lacus Solutions. Todos os direitos reservados.`, com o ano calculado por `new Date().getFullYear()` no fuso `America/Sao_Paulo`. Ele aparece no rodapé da tela de login, no rodapé da sidebar (desktop, 12 px, `--text-subtle`), em "Mais" (mobile) e em Configurações > Sobre.
  - **Licença**: `package.json` com `"private": true`, `"license": "UNLICENSED"` e `"author": "Lacus Solutions"`. O README abre com `Copyright (c) 2026 Lacus Solutions`. Sem cabeçalho de licença em cada arquivo.
- **Logo**: vem do SVG original do Júlio (grade 4×4 de quadrados arredondados dentro de uma moldura arredondada, com o quadrado da posição 3-3 em destaque), com as cores trocadas pelos tokens do design system. Salve como `public/brand/lacus-logo.svg` (versão estática, cores do tema escuro) e use o mesmo desenho no componente `<Logo />`, trocando os `fill`/`stroke` por `var(--logo-main)` e `var(--logo-accent)`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" role="img" aria-label="Lacus CRM">
  <defs><rect id="q" width="40" height="40" rx="10"/></defs>
  <rect x="10" y="10" width="280" height="280" rx="40" fill="none" stroke="#4C9EEB" stroke-width="20"/>
  <g fill="#4C9EEB">
    <use href="#q" x="40" y="40"/><use href="#q" x="100" y="40"/><use href="#q" x="160" y="40"/><use href="#q" x="220" y="40"/>
    <use href="#q" x="40" y="100"/><use href="#q" x="100" y="100"/><use href="#q" x="160" y="100"/><use href="#q" x="220" y="100"/>
    <use href="#q" x="40" y="160"/><use href="#q" x="100" y="160"/><use href="#q" x="220" y="160"/>
    <use href="#q" x="40" y="220"/><use href="#q" x="100" y="220"/><use href="#q" x="160" y="220"/><use href="#q" x="220" y="220"/>
  </g>
  <use href="#q" x="160" y="160" fill="#E8EBF0"/>
</svg>
```

- **Cores**: tema escuro, moldura e quadrados em `#4C9EEB` e quadrado de destaque em `#E8EBF0`; tema claro, `#1F6FC5` e `#11151B`. Os tokens `--logo-main` e `--logo-accent` estão na seção 7.1. Em contexto monocromático (ícone monocromático do Android, impressão), use uma cor só, com o quadrado de destaque vazado.
- **Variantes** de `<Logo variant="mark|lockup" size={…} />`: `mark` é só o símbolo (sidebar recolhida, header mobile com 24 px, favicon); `lockup` é o símbolo + "Lacus CRM" em Geist 600 ao lado (login e sidebar expandida). Tamanho mínimo 16 px, área de respeito de 10% do tamanho em todos os lados. Não distorcer, não aplicar sombra ou efeito, não usar cores fora dos tokens.
- **Acessibilidade**: ao lado do nome, o símbolo é decorativo (`aria-hidden`); sozinho, leva `role="img"` e `aria-label="Lacus CRM"`.
- **Ícones do app** (`scripts/generate-icons.ts`, com `sharp` como devDependency; commite os arquivos gerados). Fundo `#0B0D10` em todos:
  - `public/brand/icon-any.svg`: 512×512, retângulo de fundo com `rx="112"` e o logo com `translate(76 76) scale(1.2)`;
  - `public/brand/icon-maskable.svg`: 512×512, fundo preenchido até a borda e o logo com `translate(96 96) scale(1.0667)`, que o mantém dentro da zona segura de 80%;
  - saídas: `icon-192.png` e `icon-512.png` (any), `icon-maskable-192.png` e `icon-maskable-512.png`, `apple-touch-icon.png` (180 px, opaco), `favicon.ico` (16 e 32 px) e `icon.svg` (favicon vetorial).
- `DESIGN.md` ganha uma seção "Marca", e `/design-system` mostra o logo nos dois temas, o lockup, o tamanho mínimo e os ícones gerados.

## 2. Regras de trabalho para você (Claude Code)

1. **Comece em modo de plano.** (Já feito: ver `docs/PLAN.md`.)
2. **Trabalhe por fases** (seção 13). Uma fase só termina quando todos os critérios de aceite dela passam. No fim de cada fase, mostre o que foi entregue, como testar e o que ficou pendente.
3. **Faça commits pequenos** em Conventional Commits (`feat:`, `fix:`, `chore:` etc.), com pelo menos um commit por entregável. Não faça push nem deploy sem o Júlio pedir.
4. **Verifique versões e documentação atuais antes de instalar qualquer dependência** (Context7, WebFetch, `npm view <pkg> version`). Este prompt foi escrito em nov/2026, e onde ele diz "verificar na documentação atual", verifique de fato. Se a documentação contradisser este prompt, siga a documentação e registre o desvio em `docs/DECISIONS.md`.
5. **Não invente credenciais, IDs ou URLs.** Use placeholders no `.env.example`. Nunca faça commit de `.env*`, tokens ou segredos, e nunca imprima segredos em logs.
6. **Pergunte só quando houver bloqueio real**: uma credencial que falta, uma ação no painel da Vercel ou do Google, ou uma decisão de negócio ambígua. No resto, decida, registre em `docs/DECISIONS.md` e siga.
7. **Teste cada fase**: `typecheck`, `lint`, testes unitários e os testes e2e da fase precisam passar antes do commit final da fase.
8. **Idioma**: identificadores de código, banco e API em inglês; textos de interface, mensagens de erro para o usuário e documentação em pt-BR. Fuso fixo `America/Sao_Paulo`, datas exibidas em `dd/mm/aaaa`, moeda `R$ 1.234,56`.

## 3. Stack e decisões fixas

| Área             | Escolha                                                                                                                                                                        | Observação                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | **Next.js (última estável) + App Router + TypeScript `strict`**                                                                                                                | No Next 16+ o arquivo de interceptação é `proxy.ts` (antes `middleware.ts`): verifique. Runtime **Node.js** em todas as rotas que usam banco.                                                                                                                                                                                                     |
| UI               | **Tailwind CSS v4 + shadcn/ui** (Radix), ícones `lucide-react`                                                                                                                 | Tokens do design system em CSS variables (seção 7).                                                                                                                                                                                                                                                                                               |
| Banco            | **Neon Postgres** via Vercel Marketplace (`DATABASE_URL` injetada; usar `DATABASE_URL_UNPOOLED` para migrations, se existir: verificar)                                        |                                                                                                                                                                                                                                                                                                                                                   |
| ORM              | **Drizzle ORM + drizzle-kit**, migrations SQL versionadas em `drizzle/`                                                                                                        | Driver `drizzle-orm/neon-serverless` (Pool via WebSocket, com transações) quando o host for Neon; `drizzle-orm/node-postgres` quando for Postgres local (Docker), para dev e testes. Uma fábrica `db.ts` escolhe o driver pela URL. Verifique na doc da Vercel/Neon a recomendação atual para pools em Fluid Compute (ex.: `attachDatabasePool`). |
| Auth             | **Better Auth** + provedor `vercel` (Sign in with Vercel) + adapter Drizzle                                                                                                    | Justificativa na seção 5.                                                                                                                                                                                                                                                                                                                         |
| Validação        | **Zod** (v4) em toda entrada: forms, Server Actions, REST, MCP                                                                                                                 |                                                                                                                                                                                                                                                                                                                                                   |
| Dados no cliente | Server Components para leitura; mutações por **Server Actions** com wrapper que valida sessão e Zod; **TanStack Query** apenas onde há atualização otimista (board, lembretes) |                                                                                                                                                                                                                                                                                                                                                   |
| Tabela           | **TanStack Table + TanStack Virtual**, estado de filtros na URL (**nuqs**)                                                                                                     |                                                                                                                                                                                                                                                                                                                                                   |
| Drag & Drop      | **dnd-kit** (decisão na seção 6.3)                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                   |
| Ordenação        | **`fractional-indexing`** (chaves texto, coluna com `COLLATE "C"`)                                                                                                             |                                                                                                                                                                                                                                                                                                                                                   |
| Gráficos         | Recharts via componentes `chart` do shadcn                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                   |
| Datas            | `date-fns` + `@date-fns/tz`                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                   |
| CSV              | Papa Parse                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                   |
| PWA              | **Serwist** (`@serwist/turbopack` se o build usar Turbopack; verificar)                                                                                                        |                                                                                                                                                                                                                                                                                                                                                   |
| MCP              | **`mcp-handler`** (Vercel) v2 + `@modelcontextprotocol/server` v2: verificar versões e peer deps                                                                               |                                                                                                                                                                                                                                                                                                                                                   |
| Google           | `google-auth-library` (OAuth2Client) + chamadas REST à Calendar API v3 com `fetch` (evite o pacote `googleapis` inteiro)                                                       |                                                                                                                                                                                                                                                                                                                                                   |
| Testes           | **Vitest** (unit), **Playwright** + `@axe-core/playwright` (e2e e acessibilidade)                                                                                              |                                                                                                                                                                                                                                                                                                                                                   |
| Gerenciador      | **pnpm**                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                   |
| Deploy           | Vercel, plano Hobby                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                   |

Qualquer desvio desta tabela precisa de justificativa escrita em `docs/DECISIONS.md`.

## 4. Modelo de dados

### 4.1 Contrato (não renomear nem remover; só acrescentar)

Implemente exatamente estes nomes e tipos. Os campos marcados com ➕ são acréscimos permitidos pelo contrato.

**`niches`**: `id serial pk`, `name text unique not null`, `ticket niche_ticket` (enum `alto|medio|baixo`), `openness niche_openness` (enum `alta|media|baixa`), `why_buys text`, `first_offer text`, `priority int`. ➕ `created_at`, `updated_at`.

**`regions`**: `id serial pk`, `state char(2) not null`, `city text not null`, `neighborhood text null`, `label text unique not null` (formato `"PR - Curitiba - Xaxim"`; sem bairro: `"PR - <Cidade>"`), `source_sheet_id text null`.

**`leads`**:

- `id uuid pk` (reaproveita o UUID das planilhas; se vier vazio, gerar v4)
- `name text not null`, `niche_id int fk→niches not null`, `region_id int fk→regions not null`
- `phone text`, `has_whatsapp bool default false`, `email text`, `decision_maker_contact text`
- `website_url text`, `website_status website_status` (enum `none|social_only|bad|good|unknown`, default `unknown`)
- `instagram text`, `other_socials text`, `maps_url text`
- `maps_rating numeric(2,1)`, `maps_reviews int`, `owner_replies_reviews bool null`, `complaints text`
- `cnpj_opened_at date null`, `years_in_business int null`, `company_size text null`
- `has_active_ads bool default false`, `instagram_active bool default false`, `strong_local_competition bool default false`
- `score int not null default 0` (calculado pelo app)
- `contact_status contact_status not null default 'new'` (enum na 4.2)
- `last_contact_at timestamptz null`, `channel text`, `response_or_objection text`, `next_action text`
- `proposal_value numeric(12,2) null`, `notes text`, `included_at date`
- `place_id text unique null`, `maps_category text`, `address text`, `digital_signals text`, `business_summary text`, `pitch text`
- `priority int null`, `session_url text null`, `do_not_contact bool not null default false`, `source_sheet text`
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- ➕ `phone_e164 text` (normalizado, `+55DDDNUMERO`), `name_normalized text` (minúsculas, sem acento; usado na busca e na deduplicação), `score_breakdown jsonb`, `score_computed_at timestamptz`, `contact_status_changed_at timestamptz`, `do_not_contact_reason text`, `do_not_contact_at timestamptz`, `data_source text` (`google_places|import_sheet|manual|mcp`)

**`prospecting_queue`**: `position int pk`, `region_id fk`, `niche_id fk`, `status queue_status` (enum `pending|done|error`), `executed_at timestamptz null`, `leads_added int default 0`, `notes text`. ➕ `sort_order int not null` (ordem de execução; reordenar mexe aqui e **nunca** em `position`), `skipped_at timestamptz null`, `claimed_at timestamptz null` (lease de 30 min), `attempts int default 0`, `unique(region_id, niche_id)`.

**`api_usage_log`**: `id serial pk`, `day date`, `at time`, `queue_position int null`, `requests int`, `leads_saved int`, `note text`. ➕ `run_id text unique null` (idempotência).

### 4.2 Enum `contact_status`

| Valor         | Rótulo pt-BR  | Mapeamento da planilha |
| ------------- | ------------- | ---------------------- |
| `new`         | Novo          | "Novo"                 |
| `to_contact`  | A abordar     |                        |
| `contacted`   | Abordado      |                        |
| `no_response` | Sem resposta  |                        |
| `replied`     | Respondeu     |                        |
| `negotiating` | Em negociação |                        |
| `client`      | Cliente       |                        |
| `lost`        | Perdido       |                        |
| `discarded`   | Descartado    | "Descartado"           |

Na importação, qualquer valor desconhecido vira `new`, e o valor original vai para `notes` com o prefixo `[status original: …]`.

### 4.3 Tabelas adicionais

| Tabela                                                               | Colunas principais                                                                                                                                                                                                                                    | Notas                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications` | Geradas pelo CLI do Better Auth para Drizzle, renomeadas via `modelName`                                                                                                                                                                              | Verificar o comando atual de geração de schema.                                                                                                                                                                    |
| `settings`                                                           | `key text pk`, `value jsonb`, `updated_at`                                                                                                                                                                                                            | Chaves: `score_weights`, `score_thresholds`, `places_daily_budget`, `calendar_defaults`, `business_calendar` (feriados extras), `owner_profile` (nome, assinatura, link do portfólio). Validar cada chave com Zod. |
| `deal_stages`                                                        | `id serial`, `key text unique`, `name`, `color text` (token), `sort int`, `is_won bool`, `is_lost bool`, `default_probability int`, `archived_at`                                                                                                     | Seed: ver `docs/PLAN.md` (D2).                                                                                                                                                                                     |
| `deals`                                                              | `id uuid`, `lead_id fk not null on delete cascade`, `stage_id fk`, `title`, `position text collate "C" not null`, `value numeric(12,2) null`, `probability int null`, `service_type text`, `expected_close_on date null`, `status deal_status` (`open | won                                                                                                                                                                                                                | lost`), `lost_reason text`, `won_at`, `lost_at`, `stage_entered_at`, `notes`, `created_at`, `updated_at`                                                                                                                                                          | Índice único parcial `(lead_id) where status='open'`: no máximo uma negociação aberta por lead.     |
| `deal_stage_history`                                                 | `id`, `deal_id fk cascade`, `from_stage_id null`, `to_stage_id`, `moved_at`, `source` (`ui                                                                                                                                                            | mcp                                                                                                                                                                                                                | rule                                                                                                                                                                                                                                                              | import`)                                                                                            | Base das métricas de conversão por etapa.                                                                                           |
| `interactions`                                                       | `id uuid`, `lead_id fk not null cascade`, `deal_id fk null set null`, `type` (`whatsapp                                                                                                                                                               | call                                                                                                                                                                                                               | email                                                                                                                                                                                                                                                             | instagram_dm                                                                                        | in_person                                                                                                                           | meeting | proposal | note                                                                                        | system`), `direction` (`outbound                                                      | inbound | internal`), `outcome null` (`no_answer | replied | interested | not_interested | asked_later | meeting_set | proposal_requested | opt_out`), `summary text not null`, `body text`, `occurred_at timestamptz`, `template_id null`, `created_by` (`user | mcp | rule | import`), `created_at` |     |
| `reminders`                                                          | `id uuid`, `lead_id fk not null cascade`, `deal_id fk null cascade`, `title`, `notes`, `due_at timestamptz`, `duration_min int default 15`, `status` (`open                                                                                           | done                                                                                                                                                                                                               | canceled`), `completed_at`, `snooze_count int default 0`, `source` (`manual                                                                                                                                                                                       | rule                                                                                                | mcp`), `rule_id fk null`, `dedupe_key text unique null`, `google_calendar_id text`, `google_event_id text`, `sync_status` (`pending | synced  | error    | disabled`), `sync_attempts int`, `sync_error text`, `synced_at`, `created_at`, `updated_at` | Se `deal_id` estiver preenchido, `lead_id` = `deals.lead_id` (garantido por trigger). |
| `followup_rules`                                                     | `id serial`, `name`, `active bool`, `trigger` (`deal_created                                                                                                                                                                                          | deal_stage_entered                                                                                                                                                                                                 | interaction_logged`), `stage_id null`, `interaction_outcome null`, `interaction_direction null`, `cadence jsonb` (`[{offsetBusinessDays, time:"09:30", title, templateKey?}]`), `cancel_on jsonb`(ex.:`{"inboundInteraction":true,"stageLeft":true}`), `sort int` | Validar `cadence` com Zod.                                                                          |
| `message_templates`                                                  | `id serial`, `key text unique`, `name`, `channel` (`whatsapp                                                                                                                                                                                          | email                                                                                                                                                                                                              | instagram`), `niche_id null`, `stage_id null`, `body text`, `active bool`                                                                                                                                                                                         | Variáveis na seção 11.                                                                              |
| `api_tokens`                                                         | `id uuid`, `name`, `token_prefix text` (8 caracteres, exibível), `token_hash text unique` (SHA-256 hex), `scopes text[]` (`read`, `write`, `prospecting`), `last_used_at`, `expires_at null`, `revoked_at null`, `created_at`                         | O token completo aparece **uma única vez**, na criação.                                                                                                                                                            |
| `google_connections`                                                 | `id serial`, `google_email`, `refresh_token_enc text`, `access_token_enc text`, `access_token_expires_at`, `scope text`, `calendar_id text`, `status` (`active                                                                                        | needs_reauth                                                                                                                                                                                                       | revoked`), `last_error`, `connected_at`, `updated_at`                                                                                                                                                                                                             | Uma linha só. Tokens cifrados com AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, prefixo de versão de chave). |
| `job_runs`                                                           | `id uuid`, `job text`, `execution_id text unique null`, `started_at`, `finished_at`, `status`, `stats jsonb`, `error text`                                                                                                                            | Idempotência de cron e schedules.                                                                                                                                                                                  |
| `saved_views`                                                        | `id serial`, `scope` (`leads                                                                                                                                                                                                                          | deals`), `name`, `params jsonb`, `is_default bool`, `sort int`                                                                                                                                                     | Filtros salvos.                                                                                                                                                                                                                                                   |
| `suppression_list`                                                   | `id serial`, `place_id null`, `phone_e164_hash null`, `name_region_hash null`, `reason`, `created_at`                                                                                                                                                 | Impede que um lead excluído ou com opt-out seja reimportado pela rotina. Hash SHA-256.                                                                                                                             |
| `audit_log`                                                          | `id bigserial`, `entity`, `entity_id`, `action`, `actor` (`user                                                                                                                                                                                       | mcp:<tokenId>                                                                                                                                                                                                      | rule                                                                                                                                                                                                                                                              | job`), `diff jsonb`, `at`                                                                           | Registra mutações vindas de MCP/REST e regras.                                                                                      |

### 4.4 Índices e integridade

- **Índices**:
  - `leads`: `(contact_status)`, `(niche_id)`, `(region_id)`, `(score desc)`, `(phone_e164)`, GIN `pg_trgm` em `name_normalized`, `(updated_at desc)`, parcial `(id) where do_not_contact`.
  - `deals`: `(stage_id, position)`, `(lead_id)`.
  - `interactions`: `(lead_id, occurred_at desc)`, `(deal_id, occurred_at desc)`.
  - `reminders`: `(status, due_at)`, `(lead_id)`, parcial `(sync_status) where sync_status in ('pending','error')`.
  - `prospecting_queue`: `(status, sort_order)`.
  - `api_usage_log`: `(day)`.
- **Extensões**: `pg_trgm` (confirmar disponibilidade no Neon).
- **Triggers SQL** em migration custom (`drizzle-kit generate --custom`):
  - `BEFORE INSERT` em `deals` e `reminders`: se o lead tiver `do_not_contact = true`, `RAISE EXCEPTION 'LEAD_DO_NOT_CONTACT'`. O app traduz o erro para o toast "Este lead está marcado como Não contatar."
  - `BEFORE INSERT OR UPDATE` em `reminders`: se `deal_id` não for nulo, força `lead_id` = lead do deal.
  - `updated_at` automático nas tabelas que têm essa coluna.
- **Marcar `do_not_contact = true`** acontece numa única transação do app que:
  1. cancela os lembretes abertos e enfileira a remoção dos eventos no Calendar;
  2. move as negociações abertas para "Perdido" com `lost_reason = 'Não contatar'`;
  3. muda o status para `discarded`;
  4. grava `do_not_contact_reason` e `do_not_contact_at`;
  5. insere uma entrada em `suppression_list` se o motivo for opt-out.
- **Exclusão de lead**: hard delete com confirmação digitada (o usuário digita o nome do negócio), cascata para deals, interações e lembretes, e entrada automática na `suppression_list`.
- **Migrations reversíveis**: para cada migration `NNNN_*.sql`, escreva à mão o `drizzle/down/NNNN_*.down.sql` e crie o script `pnpm db:rollback`. Antes de migrar produção, crie um branch Neon de backup (documente o comando ou o passo no painel).

### 4.5 Seeds (idempotentes, `pnpm db:seed`)

- **18 nichos**: só os nomes que o Júlio fornecer, ou importação do CSV da aba Nichos. **Não invente** ticket nem abertura.
- **Etapas do funil**: ver `docs/PLAN.md` (D2), que substitui a tabela original.
- **Regras de follow-up e modelos de mensagem**: os padrões da seção 11 (adaptados a D2).
- **`settings`**:
  - `score_weights`: `{"website":30,"reputation":20,"marketing":15,"ticket":15,"directContact":10,"competition":10}`
  - `score_thresholds`: `{"green":70,"yellow":40,"minRating":4.0,"minReviews":20,"ticketPoints":{"alto":15,"medio":7.5,"baixo":0}}`

### 4.6 Score (função pura `computeScore(lead, niche, settings)`)

| Critério                                                                             | Pontos (peso editável) |
| ------------------------------------------------------------------------------------ | ---------------------- |
| `website_status ∈ {none, social_only, bad}`                                          | `website` (30)         |
| `maps_rating ≥ minRating` **e** `maps_reviews ≥ minReviews`                          | `reputation` (20)      |
| `has_active_ads` **ou** `instagram_active`                                           | `marketing` (15)       |
| `niche.ticket`: alto 15 · medio 7,5 · baixo 0 (escala proporcional ao peso `ticket`) | `ticket`               |
| `has_whatsapp` **ou** `decision_maker_contact` não vazio                             | `directContact` (10)   |
| `strong_local_competition`                                                           | `competition` (10)     |

- O resultado é `Math.round(soma)`, limitado a 0..100. O detalhamento por critério vai em `score_breakdown`.
- Faixas: **≥ 70 verde**, **40–69 amarelo**, **< 40 vermelho**.
- O score é recalculado ao salvar o lead e, em lote (transação, 500 linhas por vez), quando os pesos mudam.
- Teste obrigatório com um lead fictício: `social_only`, nota 5.0, 83 avaliações, nicho alto, WhatsApp, concorrência forte, sem anúncios, Instagram inativo → **85**.

## 5. Autenticação e segurança

### 5.1 Desenho (validado na documentação da Vercel em nov/2026)

- **Deployment Protection não substitui o login do app.**
  - _Standard Protection_ protege previews e URLs geradas, mas **não** os domínios de produção.
  - _All Deployments_ protege a produção também, mas não existe em `localhost`, não entrega a identidade do usuário ao app e bloqueia chamadores automáticos (MCP, rotina, cron externo).
  - Um relato conhecido diz que o `manifest` da PWA recebe 401 em deploy protegido. Mitigação: `<link rel="manifest" crossorigin="use-credentials">`, que precisa ser testada.
- **Camada obrigatória: auth dentro do app** com **Sign in with Vercel** (OAuth 2.0/OIDC, PKCE S256, escopos `openid email profile`), usando **Better Auth** com o provedor `vercel` nativo.
- **Por que Better Auth e não Auth.js**: provedor `vercel` oficial com PKCE; adapter Drizzle e sessões no banco com cache em cookie; hooks para allowlist; o Auth.js passou a ser mantido pela equipe do Better Auth.
- **Allowlist**:
  - O acesso é liberado se `OWNER_VERCEL_USER_ID` (o `sub` do ID token) bater, ou, como fallback, se o e-mail verificado for igual a `OWNER_EMAIL`.
  - Bloqueie no `databaseHooks.user.create.before` **e** a cada verificação de sessão na DAL.
  - Em desenvolvimento, quando o acesso for negado, a tela mostra o `sub` recebido para o Júlio preencher a variável. Em produção, mostra só "Acesso negado".
- **Camada extra no painel**: no Vercel App, em "Sign-In Access", restrinja a "Members of the team" (verificar se se aplica a contas Hobby).
- **Sessão**: cookie `httpOnly`, `secure`, `sameSite=lax`. Expiração de 30 dias, renovação diária, `cookieCache` de 5 min.
- **Logout** revoga a sessão e manda o service worker limpar os caches.

### 5.2 Callbacks e ambientes

| Ambiente | Callback registrada no Vercel App                            | `BETTER_AUTH_URL`                                            |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Local    | `http://localhost:3000/api/auth/callback/vercel`             | `http://localhost:3000`                                      |
| Preview  | Selecionar o projeto Vercel no campo de callback (verificar) | Derivar de `VERCEL_BRANCH_URL` e incluir em `trustedOrigins` |
| Produção | `https://crm.lacus.solutions/api/auth/callback/vercel`       | `https://crm.lacus.solutions`                                |

Confirme o caminho exato da callback na doc do Better Auth.

### 5.3 Proteção de rotas

- **`proxy.ts`**: só a checagem otimista do cookie de sessão. Sem cookie, redireciona para `/login`. Exceções: `/login`, `/api/auth/*`, `/api/mcp`, `/api/v1/*`, `/api/jobs/*`, `/api/google/callback` (o handler checa a sessão), `/~offline`, assets estáticos, o manifest, os ícones, as rotas do service worker (`/serwist/*`) e os endpoints `.well-known` do OAuth/MCP.
- **DAL** `lib/auth/dal.ts` com `requireOwner()`. Toda Server Action, Route Handler e Server Component com dados chama essa função. Nunca confie só no proxy.
- **`/api/mcp` e `/api/v1/*`**: `Authorization: Bearer <PAT>` (MCP também aceita token OAuth, ver PLAN D1); hash + busca em `api_tokens` (não revogado, não expirado) + checagem de escopo; `last_used_at` com throttle de 1×/min; rate limit por token (120 req/min) em memória com fallback no banco. 401 sem token, 403 com escopo insuficiente.
- **`/api/jobs/*`**: `Authorization: Bearer ${CRON_SECRET}` **ou** PAT com escopo `write`.
- **Server Actions**: proteção de origem padrão do Next. Nenhuma ação aceita `lead_id` sem checar a existência.
- **Headers de segurança**: CSP com nonce (verificar o padrão atual do Next), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy` mínima.
- **Logs**: não registram corpo de request com dados de lead nem tokens.

## 6. Telas e comportamento

**Layout geral**:

- **Mobile-first.** No celular, navegação inferior fixa com 5 itens: **Início**, **Leads**, **Funil**, **Lembretes**, **Mais** (Fila, Configurações, Design System). Alvos de toque ≥ 44 px, respeitando `safe-area-inset`.
- **Desktop (≥ 1024 px)**: sidebar recolhível e paleta de comandos `⌘K`/`Ctrl+K` (cmdk) para buscar lead por nome, telefone ou bairro e para ações rápidas.
- Toda lista tem skeleton, empty state com ação primária e tratamento de erro com "Tentar novamente".
- O **rodapé de copyright** aparece no login, na sidebar e em "Mais".

### 6.1 Dashboard (`/`)

Filtro de período (7/30/90 dias/tudo) e filtros por nicho e região. Agregações em poucas queries SQL no servidor, sem N+1.

| Bloco             | Definição                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KPIs (cards)      | Leads novos no período · Abordados no período · **Taxa de resposta** = leads com ≥1 interação `inbound` ÷ leads com ≥1 `outbound` · **Taxa de ganho** = ganhos ÷ (ganhos + perdidos) · **Valor em aberto** (soma de `value` dos deals abertos) e **valor ponderado** (× probabilidade) · **Score médio** dos leads `new`/`to_contact` |
| Follow-ups        | Atrasados (vermelho), Hoje, Próximos 7 dias; cada item com "Concluir" e "Adiar"                                                                                                                                                                                                                                                       |
| Funil             | Barras com deals por etapa (quantidade e R$) e **conversão por etapa** = deals que chegaram à etapa N+1 ÷ deals que chegaram à etapa N (via `deal_stage_history`)                                                                                                                                                                     |
| Distribuições     | Leads por status (barra horizontal), por nicho (top 10), por região, e por faixa de score                                                                                                                                                                                                                                             |
| Prospecção        | Requisições da API hoje ÷ orçamento (`places_daily_budget`), leads gravados hoje, sparkline de 14 dias, fila (pendentes/feitas/erro/puladas) e próximo item                                                                                                                                                                           |
| Melhores próximos | Top 5 leads `new`/`to_contact` sem `do_not_contact`, ordenados por `priority` e depois `score`, com botão "Abordar"                                                                                                                                                                                                                   |
| Atividade recente | Últimas 15 interações, movimentações de deal e leads criados por MCP                                                                                                                                                                                                                                                                  |
| Alertas           | Banner se o Google estiver em `needs_reauth`, se houver lembretes com `sync_status=error`, se a fila tiver itens em `error` ou se o uso da API passar do orçamento                                                                                                                                                                    |

### 6.2 Leads (`/leads`, `/leads/[id]`)

- **Tabela** virtualizada com paginação server-side (cursor, 50 por página) e estado na URL: busca, filtros, ordenação e colunas visíveis.
  - Colunas padrão: Score (badge), Nome, Nicho, Região, Status, Site, Nota/Avaliações, WhatsApp, Próxima ação, Último contato, Prioridade.
- **Filtros**: status (multi), nicho, região, faixa de score, situação do site, tem WhatsApp, `do_not_contact` (padrão: ocultar); com/sem deal aberto, com lembrete atrasado, data de inclusão, `data_source`. **Filtros salvos** (`saved_views`) aparecem como abas.
- **Busca**: `name_normalized` por trigram, telefone por dígitos, Instagram, bairro.
- **Edição inline mínima**: Status, Próxima ação e Prioridade, com feedback otimista e toast de erro com rollback.
- **Drawer de detalhe** (no mobile, rota cheia em `/leads/[id]`), com abas: **Resumo** (dados, score com breakdown, pitch, resumo do negócio), **Interações** (linha do tempo e criação rápida), **Negociação**, **Lembretes**, **Dados** (todos os 39 campos editáveis, mais a origem dos dados).
- **Ações rápidas** (barra fixa no drawer): Abrir no Maps; WhatsApp (`https://wa.me/<e164 sem +>?text=<modelo renderizado>`); Instagram; Ligar (`tel:`); Copiar pitch; Copiar mensagem; Abrir sessão do Claude (`session_url`) e Editar link da sessão; Criar negociação; Criar lembrete; **Marcar "Não contatar"** (dialog com motivo). Depois de abrir o WhatsApp, o app pergunta "Registrar como abordado?". Se sim, cria a interação `outbound`/`whatsapp`, muda o status e aplica as regras.
- **Criar lead**: formulário com validação. Antes de salvar, checa duplicata por `place_id`, `phone_e164` e `name_normalized` + região, e oferece "Abrir existente".
- **Importação CSV** (`/leads/importar`): 1. Upload. 2. Mapeamento automático pelos cabeçalhos em pt-BR da planilha (os 39, da coluna A à AM), editável. 3. **Dry-run** com contagem de criar/atualizar/ignorar/erro, prévia de 20 linhas e relatório baixável. 4. Confirmação.
  - **Conversões**: "Sim"/vazio → bool; "Não tem" → `none`, "Só rede social" → `social_only`, "Ruim" → `bad`; nota com vírgula → numeric; `dd/mm/aaaa` → date; "Cidade / bairro" → `regions` pelo label (ex.: "Xaxim, Curitiba/PR" → `PR - Curitiba - Xaxim`), criando a região se não existir; "Ticket do nicho" serve só para conferir com `niches.ticket` (divergência entra no relatório).
  - O score é **recalculado**, e o relatório lista as divergências em relação ao score da planilha.
  - Upsert por `id`, depois por `place_id`.
  - **Modo "somente novos"** (`--insert-only` nos scripts, caixa de seleção na tela, **padrão em produção**): ignora leads que já existem.
  - **Histórico**: para cada lead com "Data do contato" preenchida, crie uma interação `outbound` (`created_by='import'`, às 12:00 `America/Sao_Paulo`, canal e resumo vindos de Canal e Resposta ou objeção). Crie deal para leads em `negotiating`, `client` ou `lost`, ou com valor de proposta (e para Top leads, ver PLAN D4). Não crie lembretes a partir de "Próxima ação".
  - **Top leads sobrepõe**: `priority`, `session_url` e, quando divergir, o status (o do Top leads vence). `do_not_contact` só é aplicado depois de uma lista de casos ser confirmada pelo Júlio.
  - Importadores equivalentes para Nichos, Cidades/Regiões, Fila, Uso da API e Top leads.
- **Exportação CSV**: os mesmos 39 cabeçalhos da planilha, UTF-8 com BOM, separador `;` ou `,`, respeitando os filtros atuais.

### 6.3 Funil (`/funil`)

- **Biblioteca: dnd-kit** — `@dnd-kit/core` + `@dnd-kit/sortable` (ver PLAN D5).
- **Colunas** = `deal_stages` não arquivadas, na ordem de `sort`, com cabeçalho mostrando nome, quantidade, soma em R$ e menu (renomear, cor, limite).
- **Mobile**: colunas com scroll horizontal e `scroll-snap-type: x mandatory`, cada coluna com 85vw. Seletor de etapa em pills no topo. Arrastar só depois de long-press de 250 ms com tolerância de 5 px. Auto-scroll horizontal ao arrastar perto da borda.
- **Carta**: nome do lead, nicho · bairro, valor (R$), badge de score; próximo follow-up (data relativa; vermelho se atrasado); ícone de WhatsApp; dias na etapa (de `stage_entered_at`).
- **Ordenação**: ao soltar, `position = generateKeyBetween(anterior, próxima)`. Atualização otimista; a Server Action `moveDeal` persiste numa transação (atualiza `stage_id`/`position`, grava `deal_stage_history` e aplica as regras); erro → rollback com toast. Chaves > 50 caracteres → rebalancear a coluna.
- **Ao soltar em outra etapa**, aplique as `followup_rules` (`deal_stage_entered`), cancele os lembretes automáticos com `cancel_on.stageLeft` e mostre um toast resumindo os lembretes criados, com **Desfazer** por 8 s.
- **Ganho/Perdido**: soltar nessas colunas abre um dialog obrigatório. Ganho: valor final e data. Perdido: motivo em lista (Sem orçamento, Já tem fornecedor, Sem interesse, Sem resposta, Timing, Não contatar, Outro) e texto livre. Atualiza `deals.status` e o `contact_status` do lead (com "Não contatar", aplica o fluxo da 4.4).
- **Drawer da negociação**: dados editáveis (título, valor, probabilidade, tipo de serviço, previsão de fechamento); linha do tempo unificada (interações + mudanças de etapa + lembretes); criação rápida de interação e de lembrete (atalhos: amanhã 9h30, +2 dias úteis, +1 semana, data personalizada).
- **Acessibilidade**: mover carta pelo teclado (Espaço pega, setas movem, Esc cancela), com anúncios em pt-BR. Menu alternativo "Mover para…" em toda carta.

### 6.4 Lembretes (`/lembretes`)

- Abas **Atrasados**, **Hoje** e **Próximos**, mais um filtro "Concluídos".
- Cada item: lead, título, horário, origem (manual/regra/MCP), status de sincronização com o Calendar (ícone com tooltip de erro) e ações **Concluir**, **Adiar** (1 h, amanhã 9h30, +2 dias úteis, escolher), **Editar**, **Abrir lead** e **WhatsApp**.
- No mobile, swipe para concluir/adiar, com botões equivalentes visíveis.
- Concluir abre a opção de registrar uma interação junto.

### 6.5 Fila de prospecção (`/fila`)

- Tabela com Ordem (`sort_order`), Região, Nicho, Status, Executado em, Leads adicionados, Observações e Lease.
- Ações: reordenar por drag ou "Mover para o topo"; **Pular** (`skipped_at`) e **Reativar**; "Marcar como pendente" para itens com erro; filtros por status, cidade e nicho.
- Painel lateral com o consumo da API: hoje × orçamento e tabela do `api_usage_log` (últimos 30 dias).

### 6.6 Configurações (`/configuracoes`)

1. **Score**: pesos e limiares com prévia ao vivo ("X leads mudam de faixa") e botão Recalcular.
2. **Funil**: CRUD de etapas (nome, cor por token, probabilidade, `lead_status`, arquivar), com reordenação por drag.
3. **Follow-ups**: CRUD de regras com editor de cadência e simulador.
4. **Modelos de mensagem**: editor com variáveis clicáveis e prévia renderizada com um lead escolhido.
5. **Google Calendar**: conectar/desconectar, status, calendário usado, lembretes padrão e "Re-sincronizar tudo".
6. **Tokens de API/MCP**: criar (nome, escopos, expiração), copiar uma vez, revogar, ver último uso, e snippets prontos de `claude mcp add` e `curl`. Também lista as autorizações OAuth (conectores claude.ai) com opção de revogar.
7. **Perfil**: nome, assinatura e link do portfólio (variáveis dos modelos).
8. **Dados**: importar/exportar CSV, lista de supressão e explicação de LGPD/opt-out.
9. **Sobre**: versão e rodapé de copyright. Seletor de tema (Sistema/Escuro/Claro) e densidade ficam em "Aparência".

## 7. Design System

Escreva `DESIGN.md` na raiz e crie a rota **`/design-system`** (atrás do login) mostrando todos os tokens, componentes e estados. Os tokens ficam em `app/globals.css` como CSS variables, mapeados no `@theme` do Tailwind v4. O tema escuro é o padrão. O claro fica disponível via `data-theme="light"` com seletor em Configurações (Sistema/Escuro/Claro).

### 7.1 Cores (hex; todas as combinações texto/fundo listadas passam WCAG AA)

| Token                                        | Escuro (padrão)                | Claro                       |
| -------------------------------------------- | ------------------------------ | --------------------------- |
| `--bg`                                       | `#0B0D10`                      | `#F7F8FA`                   |
| `--surface-1` (cards)                        | `#12151A`                      | `#FFFFFF`                   |
| `--surface-2` (drawer, popover)              | `#181C22`                      | `#FFFFFF`                   |
| `--surface-3` (input, hover)                 | `#1F242C`                      | `#EEF1F5`                   |
| `--border`                                   | `#2A303A`                      | `#DDE2E8`                   |
| `--border-strong`                            | `#3A424F`                      | `#C5CCD6`                   |
| `--text`                                     | `#E8EBF0`                      | `#11151B`                   |
| `--text-muted`                               | `#A3ABB8`                      | `#4A5361`                   |
| `--text-subtle` (só ≥ 12 px, nunca em ações) | `#7F8896`                      | `#6B7482`                   |
| `--primary`                                  | `#4C9EEB` (texto `#0B0D10`)    | `#1F6FC5` (texto `#FFFFFF`) |
| `--primary-hover`                            | `#6AB0F0`                      | `#185DA8`                   |
| `--focus-ring`                               | `#7CC0FF` (2 px + offset 2 px) | `#1F6FC5`                   |
| `--success`                                  | `#3FB97A`                      | `#1E7F4F`                   |
| `--warning`                                  | `#E5A93B`                      | `#9A6A0B`                   |
| `--danger`                                   | `#F0645A`                      | `#C23A31`                   |
| `--logo-main`                                | `#4C9EEB` (= `--primary`)      | `#1F6FC5` (= `--primary`)   |
| `--logo-accent`                              | `#E8EBF0` (= `--text`)         | `#11151B` (= `--text`)      |

**Score (badge)**: o número com fundo e texto do token, nunca só cor (inclua também o rótulo no `aria-label`).

| Faixa | Fundo     | Texto     | Rótulo acessível |
| ----- | --------- | --------- | ---------------- |
| ≥ 70  | `#133A27` | `#6EE0A2` | "Score alto"     |
| 40–69 | `#3A2F12` | `#F2C55C` | "Score médio"    |
| < 40  | `#3D1A18` | `#FF8A80` | "Score baixo"    |

No tema claro, use fundo `#E3F5EB`/`#FBF0D5`/`#FBE4E2` e texto `#1E7F4F`/`#8A5D00`/`#B3261E`.

**Etapas do funil** (borda superior de 3 px na coluna e ponto na carta): `stage-1 #8B95A5`, `stage-2 #4C9EEB`, `stage-3 #8B8CF6`, `stage-4 #B57BEE`, `stage-5 #E5A93B`, `stage-6 #F08A4B`, `stage-won #3FB97A`, `stage-lost #F0645A`.

**Gráficos**: série categórica nesta ordem: `#4C9EEB`, `#3FB97A`, `#E5A93B`, `#B57BEE`, `#F08A4B`, `#8B95A5`. Grade `--border`, eixos `--text-muted`.

### 7.2 Tipografia, espaço, forma, movimento

- **Fontes**: **Geist** (UI) e **Geist Mono** (IDs, telefones, valores), via `next/font`. Números em tabelas e KPIs com `font-variant-numeric: tabular-nums`.
- **Escala** (tamanho/altura de linha, em px): Rótulos 12/16 peso 500 · Tabela 13/18 · Corpo 14/20 · Destaque 16/24 · Título de seção 20/28 peso 600 · Título de página 24/32 peso 600 · KPI 30/36 peso 600.
- **Espaçamento** (base 4): 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Raios**: `sm 6`, `md 8` (inputs, botões), `lg 12` (cards, cartas), `xl 16` (drawer, dialog), `full`.
- **Elevação (escuro)**: `e1`: `inset 0 1px 0 rgba(255,255,255,.04), 0 1px 2px rgba(0,0,0,.40)`; `e2`: `0 4px 12px rgba(0,0,0,.45)`; `e3` (drawer/dialog): `0 12px 32px rgba(0,0,0,.55)`; `drag`: `0 16px 40px rgba(0,0,0,.60)`, com `scale(1.02) rotate(1deg)`. No claro, os mesmos offsets com alpha de `.08/.10/.14/.18`.
- **Movimento**: `fast 120ms` (hover, toggle), `base 180ms` (popover, toast), `slow 260ms` (drawer). Entrada `cubic-bezier(.2,0,0,1)`, saída `cubic-bezier(.4,0,1,1)`. Com `prefers-reduced-motion`, só fade de 120 ms, sem transform.
- **Densidade**: toggle Confortável (linha de tabela 44 px) / Compacto (36 px), padrão Confortável no mobile e Compacto no desktop. Controles: `sm 32 px`, `md 36 px`, `lg 44 px` (padrão no mobile).
- **Z-index**: base 0, sticky 10, nav 20, drawer 40, dialog 50, toast 60, drag overlay 70.

### 7.3 Componentes e estados obrigatórios (todos demonstrados em `/design-system`)

| Componente                                               | Estados e variantes                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão                                                    | primary, secondary, ghost, destructive, link; tamanhos sm/md/lg; default, hover, active, focus-visible, disabled e loading (spinner + texto mantido, `aria-busy`) |
| Input, Select, Combobox, Textarea, DatePicker            | Rótulo sempre visível, ajuda, erro (borda `--danger` + mensagem com `aria-describedby`), desabilitado, somente leitura                                            |
| Tabela                                                   | Cabeçalho sticky, ordenação com ícone e `aria-sort`, linha hover/selecionada, célula editável, skeleton de 8 linhas, empty state                                  |
| Badge                                                    | Neutro, status (um por `contact_status`), score (3 faixas), sync (synced/pending/error)                                                                           |
| Carta do kanban                                          | Repouso, hover, foco, arrastando (`drag`), placeholder (borda tracejada `--border-strong`), atrasado (barra esquerda `--danger`)                                  |
| Drawer                                                   | Lateral à direita (desktop, 480 px) e bottom sheet (mobile, 92vh com alça); foco preso e Esc fecha                                                                |
| Toast                                                    | success, error, info, com ação (Desfazer); vida de 5 s (8 s com ação); `aria-live="polite"`                                                                       |
| Empty state                                              | Ícone 40 px, título, frase, ação primária                                                                                                                         |
| Skeleton                                                 | Pulso de 1,2 s; desligado com reduced-motion                                                                                                                      |
| KPI card, gráfico, timeline, bottom nav, command palette | Demonstrados com dados fictícios                                                                                                                                  |

**Regras**: nunca transmitir informação só por cor; contraste mínimo AA (4,5:1 para texto, 3:1 para ícones e bordas de foco); foco sempre visível; nenhum texto menor que 12 px.

## 8. PWA

- **Manifest** (`app/manifest.ts`): `name`/`short_name` "Lacus CRM", `display: standalone`, `start_url: "/?source=pwa"`, `scope: "/"`; `background_color #0B0D10`, `theme_color #0B0D10`, `lang pt-BR`; ícones 192/512 `any` e 192/512 `maskable`; `apple-touch-icon` 180 px; shortcuts "Novo lead", "Lembretes de hoje", "Funil". Link com `crossorigin="use-credentials"`.
- **Service worker (Serwist)**: precache do shell e dos assets estáticos; `NetworkFirst` (timeout de 3 s) **somente** para `GET /api/offline/snapshot`, que devolve um JSON mínimo (lembretes de hoje e atrasados, os 50 leads com maior prioridade/score com nome, telefone, próxima ação, status e score, e a data do snapshot); fallback de navegação para `/~offline`, que renderiza esse snapshot em modo leitura com o aviso "Você está offline: dados de dd/mm hh:mm". **Nunca cachear**: `/api/auth/*`, `/api/mcp*`, `/api/v1/*`, `/api/jobs/*`, `/api/google/*`, `.well-known/*`, POSTs, Server Actions e páginas HTML autenticadas. No logout, o SW recebe uma mensagem e limpa todos os caches de runtime.
- **Instalação**: Android/Chrome com botão "Instalar app" (`beforeinstallprompt`) em "Mais"; iOS com tela de instrução (Compartilhar → Adicionar à Tela de Início) mostrada uma vez, quando `navigator.standalone` for falso.
- **Atualização**: toast "Nova versão disponível" com "Atualizar".
- **Login no app instalado**: só por redirect em tela cheia (nunca popup).
- **Critérios de aceite**: DevTools > Application > Manifest sem erros de instalabilidade; instala e abre em standalone no Android e no iOS; offline abre `/~offline` com o snapshot; Lighthouse (mobile, logado, banco aquecido) em `/`: Performance ≥ 80, Accessibility ≥ 95, Best Practices ≥ 95.
- **Fora do v1**: Web Push e fila offline de interações.

## 9. MCP e API REST

**Arquitetura**: toda regra de negócio vive em `lib/services/*`, usada por Server Actions, REST e MCP. REST e MCP são só adaptadores finos com Zod e `audit_log`.

### 9.1 Endpoint MCP

- `app/api/mcp/route.ts` (Streamable HTTP, stateless), validando PAT **ou** token OAuth (PLAN D1), `runtime = "nodejs"` e `maxDuration` adequado ao Hobby (verificar). `app/api/mcp/prospecting/route.ts` expõe só as ferramentas de prospecção.
- Toda ferramenta devolve `structuredContent` e um texto curto. Listas limitadas a 50 itens, com cursor.

| Ferramenta                                                              | Escopo               | Entrada (resumo)                                                                                                      | Saída (resumo)                                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crm_search_leads`                                                      | read                 | `query?`, `status?[]`, `nicheId?`, `regionLabel?`, `minScore?`, `hasOpenDeal?`, `limit≤50`, `cursor?`                 | `{items: LeadSummary[], nextCursor}`                                                                                                                                           |
| `crm_get_lead`                                                          | read                 | `id` ou `placeId`                                                                                                     | Lead completo + deal aberto + 20 últimas interações + lembretes abertos                                                                                                        |
| `crm_upsert_leads`                                                      | write ou prospecting | `{runId, queuePosition?, leads: LeadInput[≤20]}`                                                                      | `{created[], updated[], skipped[{ref, reason}]}`                                                                                                                               |
| `crm_update_lead`                                                       | write                | `id`, `patch` (lista branca de campos, incluindo `session_url`, `next_action`, `pitch`, `priority`, `contact_status`) | Lead                                                                                                                                                                           |
| `crm_set_do_not_contact`                                                | write                | `id`, `reason`, `optOut: bool`                                                                                        | Resultado do fluxo 4.4                                                                                                                                                         |
| `crm_log_interaction`                                                   | write                | `leadId`, `dealId?`, `type`, `direction`, `outcome?`, `summary`, `occurredAt?`                                        | Interação + lembretes criados/cancelados                                                                                                                                       |
| `crm_create_deal` / `crm_move_deal`                                     | write                | `leadId`, `title`, `value?`, `stageKey?` / `dealId`, `stageKey`, `placement: top\|bottom`, `lostReason?`              | Deal + efeitos das regras                                                                                                                                                      |
| `crm_list_reminders`                                                    | read                 | `range: overdue\|today\|next7`                                                                                        | Lembretes                                                                                                                                                                      |
| `crm_create_reminder` / `crm_complete_reminder` / `crm_snooze_reminder` | write                | Usuais                                                                                                                | Lembrete                                                                                                                                                                       |
| `crm_render_message`                                                    | read                 | `leadId`, `templateKey`                                                                                               | `{text, waLink}` (nunca envia)                                                                                                                                                 |
| `crm_dashboard_summary`                                                 | read                 | `period?`                                                                                                             | KPIs da 6.1                                                                                                                                                                    |
| `queue_claim_next`                                                      | prospecting          | `{runId}`                                                                                                             | Próximo item `pending`, não pulado e sem lease ativo (ordem `sort_order`), com `regionLabel`, `nicheName` e dados do nicho; marca `claimed_at`. `null` se a fila estiver vazia |
| `queue_complete`                                                        | prospecting          | `{position, runId, status: done\|error, leadsAdded, notes}`                                                           | Item atualizado (idempotente)                                                                                                                                                  |
| `api_usage_today` / `api_usage_log`                                     | prospecting          | — / `{runId, queuePosition?, requests, leadsSaved, note}`                                                             | `{requestsToday, budget, remaining}` / registro (único por `runId`)                                                                                                            |
| `niches_list`, `regions_list`                                           | read (e prospecting) | —                                                                                                                     | Listas                                                                                                                                                                         |

### 9.2 Upsert idempotente de leads (o mesmo serviço para MCP e REST)

1. **Normalização**: `phone_e164`, `name_normalized`, região por `regionLabel` (cria se não existir), nicho por `nicheName` exato (erro se não existir).
2. **Supressão**: se `place_id`, telefone ou nome+região estiver na `suppression_list`, ou se o lead existente tiver `do_not_contact`, o item vai para `skipped` com motivo `suppressed`/`do_not_contact`.
3. **Casamento**: primeiro `place_id`, depois `phone_e164`, depois `name_normalized` + `region_id`. Duplicata com outro `place_id` → `skipped: duplicate_phone|duplicate_name`.
4. **Atualização de lead existente**: só "campos de máquina". Sempre atualiza: `maps_rating`, `maps_reviews`, `maps_url`, `address`, `maps_category`, `digital_signals`. Preenche se vazio: `website_url`, `instagram`, `business_summary`, `pitch`. `website_status` só muda se o atual for `unknown`. **Nunca** sobrescreve campos humanos: status, notas, próxima ação, prioridade, `session_url`, `do_not_contact`, resposta/objeção, canal, proposta.
5. **Inserção**: `id` informado ou v4 novo, `data_source = google_places`, `included_at` = hoje, score calculado.
6. Tudo numa transação por lote, com `audit_log` registrando `actor = mcp:<tokenId>`.

Repetir a mesma chamada produz o mesmo estado (teste obrigatório).

### 9.3 REST equivalente (`/api/v1`, JSON, Bearer PAT)

`GET /leads` · `GET /leads/:id` · `PATCH /leads/:id` · `POST /leads/upsert` · `POST /leads/:id/interactions` · `POST /queue/claim` · `POST /queue/:position/complete` · `GET /api-usage/today` · `POST /api-usage` · `GET /reminders?range=` · `POST /jobs/followups`.

Erros no formato `{error: {code, message, details?}}`. Publique `GET /api/v1/openapi.json`, gerado a partir dos schemas Zod.

### 9.4 Conexão e rotina agendada (documentar em `docs/OPERACAO.md` e `docs/ROTINA.md`)

```bash
# Claude Code (interativo) – token com escopos read+write
claude mcp add --transport http lacus-crm https://crm.lacus.solutions/api/mcp --scope user \
  --header "Authorization: Bearer <PAT>"
```

Para versionar, use um `.mcp.json` com `"headers": {"Authorization": "Bearer ${LACUS_CRM_TOKEN}"}`. Não use nomes de variável reservados, como `ANTHROPIC_*`.

**Rotina agendada** (tarefa agendada no claude.ai, conector OAuth em `/api/mcp/prospecting`). Fluxo:

1. `queue_claim_next`
2. `api_usage_today` (aborta se `remaining` for insuficiente)
3. Places API + filtros F0–F8 (a lógica continua na rotina, não no app)
4. `crm_upsert_leads`
5. `api_usage_log`
6. `queue_complete`

Todos os passos levam o mesmo `runId` (ex.: `2026-11-18T14:00Z-pos37`), e um retry não duplica nada. Inclua um prompt de exemplo para a rotina em `docs/ROTINA.md`.

## 10. Google Calendar

- **Configuração no Google Cloud** (passo a passo em `docs/GOOGLE.md`, sem IDs reais): usar o projeto já existente; ativar a Calendar API; no Google Auth Platform: Branding, Audience **External**, Data Access; OAuth Client **Web application** com redirect URIs exatas `http://localhost:3000/api/google/callback` e `https://crm.lacus.solutions/api/google/callback`. Sem curinga → conectar o Google só funciona em local e produção; em preview, a tela mostra "Disponível apenas em produção".
- **Escopo mínimo**: `https://www.googleapis.com/auth/calendar.app.created` + `openid email`. Use `calendar.events` apenas se necessário; justifique em DECISIONS.
- **Fluxo**: `GET /api/google/connect` (requer sessão) gera `state` + PKCE em cookie e redireciona com `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. `GET /api/google/callback` valida `state`, troca o code, cifra e salva os tokens, e cria (ou reaproveita pela `summary`) o calendário **"Lacus CRM – Follow-ups"** com `timeZone: America/Sao_Paulo`.
- **Modo Testing**: refresh tokens expiram em 7 dias → publicar o app ("In production"); tela "app não verificado" é aceitável para uso pessoal. Verifique a política atual e documente.
- **Mapeamento lembrete → evento**: `summary` `"Follow-up: {lead.name} – {title}"`; `description` com próxima ação, telefone, link `wa.me`, link para `/leads/{id}` e notas; `start`/`end` = `due_at` + `duration_min`; `reminders: {useDefault:false, overrides:[{method:"popup", minutes:N}]}` (padrão 10 e 0); `extendedProperties.private: {crmReminderId, crmLeadId}`.
- **Sincronização (outbox)**: toda mutação marca `sync_status='pending'` na mesma transação; `after()` do Next tenta sincronizar; concluído ou cancelado → **apagar o evento**; falha → `error` com `sync_attempts++` e backoff (1, 5, 30 min, depois só no job); `invalid_grant` → `needs_reauth`, banner, lembretes voltam a `pending`; 404/410 com lembrete aberto → recriar; "Re-sincronizar tudo" reconcilia via `privateExtendedProperty=crmReminderId=…`; sem conexão → `disabled`.

## 11. Automação de follow-ups

**Princípio**: regras **criam lembretes** (e eventos) e sugerem a mensagem. **Nunca enviam nada.**

- **Dias úteis**: segunda a sexta, menos feriados nacionais (fixos e móveis via Páscoa: Carnaval, Sexta-feira Santa, Corpus Christi), Curitiba (8/set) e os extras de `settings.business_calendar`. Função pura `addBusinessDays(date, n, calendar)` com testes.
- **Cadências padrão (seed, adaptadas ao funil D2)**:

| Regra                      | Gatilho                                                                       | Cadência                                                                                                   | Cancela quando                          |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Sem resposta ao 1º contato | `interaction_logged` (outbound, sem outcome positivo) com lead em `contacted` | +2, +5 e +10 dias úteis às 09:30 ("Follow-up 1/2/3"). Ao concluir o 3º sem resposta, sugerir `no_response` | Interação `inbound` ou mudança de etapa |
| Proposta enviada           | `interaction_logged` com `interaction_type = proposal` (PLAN D2)              | +2, +5 e +10 dias úteis às 10:00                                                                           | Inbound ou etapa deixada                |
| Pediu para retomar depois  | outcome `asked_later`                                                         | +20 dias úteis (editável no momento)                                                                       | Inbound                                 |
| Reunião marcada            | outcome `meeting_set`                                                         | Data informada − 1 dia útil, "Preparar diagnóstico"                                                        | —                                       |
| Negociação parada          | Job diário: deal aberto há > 10 dias úteis na mesma etapa sem lembrete aberto | "Destravar negociação"                                                                                     | —                                       |
| Ganho                      | `deal_stage_entered` = Ganho                                                  | +1 dia útil "Onboarding: coletar materiais"                                                                | —                                       |

- **Efeitos de status do lead**: ver PLAN D3 (sincronia só para frente). 1ª outbound → `contacted` + `last_contact_at`; inbound → `replied`; ganho → `client`; perdido → `lost`; outcome `opt_out` → fluxo "Não contatar".
- **Idempotência**: `dedupe_key = rule:{ruleId}:step:{i}:anchor:{interactionId|dealStageHistoryId}`.
- **Modelos de mensagem**: variáveis `{{nome_negocio}}`, `{{nicho}}`, `{{bairro}}`, `{{cidade}}`, `{{nota_maps}}`, `{{avaliacoes}}`, `{{situacao_site}}`, `{{argumento}}` (pitch), `{{meu_nome}}`, `{{link_portfolio}}`, `{{saudacao}}`. Variável ausente → aviso na prévia; texto final não pode conter `{{` (bloqueia "Abrir WhatsApp"). Seeds: "Primeiro contato – WhatsApp", "Follow-up 1", "Follow-up 2 (último)", "Envio de proposta", "Retomada". O primeiro contato termina com: "Se preferir não receber mensagens minhas, é só avisar que não entro mais em contato." Textos genéricos, sem dados reais.
- **Jobs**: `POST /api/jobs/followups` reaplica regras pendentes, cria "negociação parada", reprocessa sync `pending`/`error`, libera leases vencidos da fila e grava `job_runs`. Idempotência por `execution_id` (header `ce-id` dos Schedules ou `X-Run-Id`).
- **Agendamento no Hobby**: preferência por Vercel Schedule de alvo _path_ a cada hora entre 7h e 21h `America/Sao_Paulo`, autenticado por `CRON_SECRET`; fallback cron diário às 10:00 UTC. Verificar disponibilidade e sintaxe. Também aceita disparo externo com PAT.

## 12. Estrutura do repositório e `.env.example`

```
app/
  (auth)/login/  (app)/page.tsx  (app)/leads/  (app)/funil/  (app)/lembretes/
  (app)/fila/  (app)/configuracoes/  (app)/design-system/  ~offline/
  api/auth/[...all]/  api/mcp/  api/v1/…  api/jobs/followups/  api/google/{connect,callback}/
  api/offline/snapshot/  manifest.ts  sw.ts
components/{ui,brand,leads,deals,reminders,dashboard,layout}/
lib/{db/{schema/*.ts,index.ts},auth/{auth.ts,dal.ts},services/*,score/,rules/,business-days/,
     google/,crypto/,csv/,mcp/tools/*,validation/*,format/}
drizzle/{NNNN_*.sql,down/,meta/}   scripts/{seed.ts,import/*.ts,rollback.ts,generate-icons.ts}
tests/{unit,e2e}   docs/{DECISIONS.md,OPERACAO.md,GOOGLE.md,ROTINA.md}   DESIGN.md  README.md
```

```dotenv
DATABASE_URL=
DATABASE_URL_UNPOOLED=
BETTER_AUTH_SECRET=            # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
VERCEL_CLIENT_ID=
VERCEL_CLIENT_SECRET=
OWNER_VERCEL_USER_ID=
OWNER_EMAIL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
CRON_SECRET=                   # >= 16 caracteres aleatórios
APP_TIMEZONE=America/Sao_Paulo
NEXT_PUBLIC_APP_URL=http://localhost:3000
E2E_AUTH_BYPASS=0
```

Valide as variáveis no boot com Zod (`lib/env.ts`), com mensagens claras dizendo o que falta.

## 13. Fases de execução

| #   | Fase                              | Entregáveis                                                                                                                                                                                                                                                        | Critérios de aceite                                                                                                                                                                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fundação + auth + banco           | Scaffold; tokens e shell (sidebar, bottom nav, tema); marca (logo, favicon, ícones) e rodapé; schema completo + triggers + down migrations; seeds; Better Auth + allowlist; `proxy.ts` + DAL; `/design-system` inicial; CI (GitHub Actions: typecheck, lint, unit) | Login com Vercel funciona em localhost; conta fora da allowlist é recusada; `db:migrate` → `db:rollback` → `db:migrate` roda limpo; triggers de `do_not_contact` testados; deploy de preview abre `/login`; logo e rodapé aparecem no login e no shell |
| 2   | Leads                             | Tabela, filtros, views salvas, drawer, CRUD, score, ações rápidas, "Não contatar", importação/exportação CSV (+ importadores de nichos, regiões, fila, uso da API, top leads)                                                                                      | Importar CSV de exemplo com os 39 cabeçalhos cria/atualiza corretamente (reimportar não muda nada); exportar e reimportar dá o mesmo resultado; duplicata detectada; score = 85; e2e "criar → editar → marcar Não contatar"                            |
| 3   | Funil + interações                | Board dnd-kit, CRUD de etapas, deals, timeline, ganho/perda, histórico de etapas                                                                                                                                                                                   | Arrastar com mouse, teclado e toque persiste a ordem após reload; erro simulado faz rollback; uma negociação aberta por lead; e2e "criar deal → mover → ganhar"                                                                                        |
| 4   | Lembretes + Calendar + follow-ups | Tela de lembretes, OAuth Google, calendário dedicado, outbox, motor de regras, dias úteis, modelos, `/api/jobs/followups`, schedule/cron                                                                                                                           | Interação Proposta cria 3 lembretes nas datas úteis corretas (com feriado); inbound cancela os pendentes; reexecutar o job não duplica; evento aparece, muda e some no Calendar (teste manual documentado); `invalid_grant` simulado mostra o banner   |
| 5   | Dashboard                         | Blocos da 6.1                                                                                                                                                                                                                                                      | Números batem com fixtures SQL; 5.000 leads < 1,5 s no servidor com banco aquecido                                                                                                                                                                     |
| 6   | PWA                               | Manifest, ícones, Serwist, `/~offline`, snapshot, instrução iOS, toast de atualização                                                                                                                                                                              | Critérios da seção 8                                                                                                                                                                                                                                   |
| 7   | MCP/API + Fila                    | Tokens, OAuth MCP, `/api/mcp`, `/api/mcp/prospecting`, `/api/v1`, OpenAPI, tela da Fila, docs de operação e rotina                                                                                                                                                 | `claude mcp add` conecta e lista as ferramentas; fluxo da rotina roda 2× com o mesmo `runId` sem duplicar; token `prospecting` recebe 403 em `crm_update_lead`; token revogado recebe 401                                                              |
| 8   | Polimento + deploy                | Paleta ⌘K, revisão de acessibilidade, estados vazios e de erro, README, checklist de deploy                                                                                                                                                                        | Suíte e2e verde; axe sem violações serious/critical; Lighthouse da seção 8; deploy validado pelo Júlio                                                                                                                                                 |

## 14. Testes e qualidade

- **Unit (Vitest)**: `computeScore` (todas as combinações e limites 3,9/4,0 e 19/20); `addBusinessDays` (feriados móveis de 2026 e 2027); motor de regras (criação, cancelamento, `dedupe_key`); renderização de modelos; normalização de telefone/nome; parser de "Cidade / bairro"; mapeamento CSV; chaves fracionárias; cifra/decifra; hash e validação de PAT.
- **Integração**: serviços contra Postgres real (Docker), cada teste numa transação revertida. Upsert idempotente e triggers.
- **E2E (Playwright)**: login por rota de bypass ativa **só** com `E2E_AUTH_BYPASS=1` e `NODE_ENV !== "production"` e `VERCEL_ENV` indefinido; fluxos de leads, funil (teclado e toque), lembretes, importação, tokens; projetos desktop e mobile (iPhone 14, Pixel 7).
- **Acessibilidade**: `@axe-core/playwright` em todas as rotas principais nos dois temas.
- **Migrations**: o CI aplica up, down e up num banco descartável.
- **Qualidade**: ESLint + Prettier, `tsc --noEmit`, nenhum `any` sem comentário, scripts `pnpm check` e `pnpm e2e`.

## 15. Fora de escopo e riscos

**Fora do v1**: chamar a Places API pelo app; envio automático de WhatsApp/e-mail/DM; multiusuário; Web Push; edição offline; sincronização bidirecional com o Calendar.

| Risco                                     | Mitigação                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Hobby é para uso não comercial            | Verificar os termos; pode ser preciso migrar para Pro                  |
| Cron diário ±59 min; Schedules em beta    | Lembretes com hora vivem no Calendar; job idempotente; fallback diário |
| Cold start do Neon                        | `cookieCache`, skeletons, queries agregadas                            |
| Limites do plano grátis do Neon           | Volume pequeno; verificar limites                                      |
| Refresh token do Google expira em Testing | Publicar em produção; `invalid_grant` com banner                       |
| Banimento de WhatsApp                     | Só `wa.me` manual, uma abordagem por vez                               |
