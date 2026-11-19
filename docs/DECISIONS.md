# Decisões e desvios

Registro das decisões da fase 0 (`docs/PLAN.md`) e de tudo que foi verificado ou desviado da especificação durante a execução. Onde este arquivo conflita com `docs/SPEC.md`, este arquivo vale.

## Desvios aprovados na fase 0

- **D1. MCP com OAuth entra no v1.** Conectores do claude.ai não mandam header Bearer fixo. `@better-auth/mcp` faz do app um servidor de autorização OAuth 2.1. `/api/mcp` aceita PAT e token OAuth; `/api/mcp/prospecting` expõe só as ferramentas da rotina (menor privilégio). Transporte (mcp-handler 2.4 ou `@modelcontextprotocol/server` v2) a confirmar na fase 7.
- **D2. Funil novo** (`deal_stages`): `to_diagnose` A diagnosticar 5%, `to_contact` A abordar 10%, `contacted` Abordado 20%, `talking` Em conversa 35%, `negotiating` Em negociação 60%, `won` Ganho 100%, `lost` Perdido 0%. Coluna ➕ `deal_stages.lead_status`. Sem etapa "Proposta enviada": a cadência de proposta dispara por interação `proposal`, com a coluna ➕ `followup_rules.interaction_type`.
- **D3. Sincronia etapa e status só para frente** (`new < to_contact < contacted < no_response < replied < negotiating < client`; `lost`, `client` e `discarded` sempre aplicados). Substitui "deal criado vira `negotiating`" da seção 11.
- **D4. Top leads** sem deal aberto ganham um deal na etapa equivalente ao status.
- **D5. DnD**: `@dnd-kit/core` + `@dnd-kit/sortable` (`@dnd-kit/react` está < 1.0).
- **D6. Convenções do repo `lacus.solutions`**: commitlint com a mesma `type-enum` (inclui `ai`), husky e lint-staged; pnpm no lugar do bun.

## Fase 1: verificações e desvios

### Versões instaladas (19/11/2026)

next 16.4.6, react 19.3.1, better-auth 1.7.26, drizzle-orm 0.45.4, drizzle-kit 0.31.11, @neondatabase/serverless 1.2.1, pg 8.23.1, zod 4.6.7, tailwindcss + @tailwindcss/postcss 4.3.5, vitest 5.1.1, @playwright/test 1.65.1, @axe-core/playwright 4.14.0, sharp 0.35.5, geist 1.9.2, sonner 2.0.8, papaparse 5.7.1, @vercel/functions 3.11.3, typescript 5.9.3, eslint 9.39.5, eslint-config-next 16.4.6, husky 9.1.7, lint-staged 17.6.1, Node 24, pnpm 12.8.1. O CLI de geração do Better Auth (`auth@1.7.25`) foi usado via `pnpm dlx`.

### Desvios

1. **TypeScript 5.9 e ESLint 9, não as últimas.** `typescript@7.0.2` quebra o `typescript-eslint` 8.73 ("does not support TS 7.0"). Fixados `typescript@5.9` e `eslint@9` até o ecossistema acompanhar.
2. **`proxy.ts` confirmado para o Next 16.4.** A doc (v16.4.5) manda renomear `middleware.ts` para `proxy.ts` (export `proxy`), e o `next build` lista "Proxy (Middleware)". Runtime Node. O proxy também gera o nonce do CSP, por isso roda em toda página (a checagem de cookie só vale fora das rotas públicas da seção 5.3).
3. **Allowlist em `user.validateUserInfo`, não em `databaseHooks.user.create.before`.** O hook `create.before` não recebe o `sub` do provedor, só os campos do usuário. O Better Auth 1.7 tem `user.validateUserInfo`, que recebe o perfil bruto (com `sub`) em `create-user`, `link-account` e a cada `sign-in`, e falha fechado (exceção vira 403). A segunda camada continua sendo a DAL (`requireOwner`, a cada chamada). Regra: com `OWNER_VERCEL_USER_ID` definido, só o `sub` vale; sem ele, vale `OWNER_EMAIL` verificado; sem nenhum dos dois, ninguém entra (em produção a env exige um dos dois). Em dev, a recusa mostra o `sub` recebido (`error_description`); em produção, só "Acesso negado". Não consegui testar o fluxo OAuth real sem credenciais; a função `isOwner` tem testes unitários.
4. **CSP**: scripts com nonce + `strict-dynamic` (padrão da doc do Next 16.4). `style-src 'self' 'unsafe-inline'` sem nonce, porque atributos `style` e o sonner usam estilo inline e nonce não vale para eles; os scripts, que são a parte relevante contra XSS, seguem protegidos. `upgrade-insecure-requests` só em produção. Os demais headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) ficam em `next.config.ts`.
5. **Driver do banco**: `lib/db/index.ts` usa neon-serverless (Pool/WebSocket) quando o host termina em `.neon.tech` e node-postgres no resto; ambos passam por `attachDatabasePool` (`@vercel/functions`), recomendado pela doc da Vercel para pools em Fluid Compute. Não instalei `ws`: a doc do driver Neon só pede `neonConfig.webSocketConstructor` em Node 21 ou anterior, e o projeto usa Node 24. Migrations e rollback usam `DATABASE_URL_UNPOOLED` quando existir, senão `DATABASE_URL`.
6. **`db:migrate` é o `drizzle-kit migrate`**, e `db:rollback` é `scripts/rollback.ts` (executa `drizzle/down/<tag>.down.sql` e apaga o registro em `drizzle.__drizzle_migrations`, uma transação por migration; aceita `n` ou `all`). A extensão `pg_trgm` fica na migration `0000_extensions` (antes do índice GIN). Postgres 17 inclui `pg_trgm` no contrib; no Neon, `CREATE EXTENSION pg_trgm` é suportado, mas confirmar no primeiro migrate de produção.
7. **Schema**: todas as colunas do contrato, mais os ➕ da seção 4.1 e os do PLAN. Enumerações citadas só entre parênteses na seção 4.3 viraram `pgEnum` (integridade no banco). Triggers e funções com prefixo `lacus_`. O trigger de `lead_id` do lembrete e o de `do_not_contact` foram separados e numerados (`1_` e `2_`) para a ordem de disparo ser determinística. Tabelas `auth_*` geradas pelo CLI do Better Auth, ajustadas para `timestamptz` e sem relations. Índices extras além da 4.4: três em `suppression_list` (hash/place_id), pois a rotina consulta por eles a cada lead.
8. **`api_usage_log.day/at`, `followup_rules.cadence` e `queue.sort_order`** são `NOT NULL`; `deal_stages.lead_status` é nulável (etapas criadas pelo usuário podem não sincronizar status).
9. **Seeds nunca sobrescrevem edições** (`ON CONFLICT DO NOTHING`; regras de follow-up checadas por nome). Regras semeadas: "Sem resposta ao 1º contato" (outbound; +2/+5/+10), "Proposta enviada" (`interaction_type=proposal`; +2/+5/+10 às 10:00), "Pediu para retomar depois" (+20), "Reunião marcada" (offset -1, ancorado na data informada) e "Ganho" (+1). As condições "lead em `contacted`" e "sem outcome positivo" da regra 1 ficam no motor (fase 4), pois `followup_rules` não tem coluna para elas. "Negociação parada" roda no job diário da fase 4, sem linha em `followup_rules` (o enum `trigger` não tem gatilho de job).
10. **Nichos**: lidos da aba "Nichos" da planilha `PR - Curitiba - Prospecção` (somente leitura, conector do Google Sheets) para `.data/nichos.csv` (fora do git): 18 nichos, com ticket, abertura, "por que costuma comprar" e "o que oferecer primeiro". A planilha não tem prioridade; `niches.priority` fica nulo.
11. **Bypass de E2E**: rota `/api/e2e/login` responde 404 salvo com `E2E_AUTH_BYPASS=1`, `NODE_ENV !== "production"` e `VERCEL_ENV` indefinido. Usa o plugin `testUtils` do Better Auth em uma instância separada (`lib/auth/e2e.ts`, importada dinamicamente só depois da guarda), como a doc do plugin recomenda. A DAL aceita o usuário de teste (`sub = e2e-owner`) só com o bypass ativo.
12. **Componentes shadcn escritos à mão** no estilo do shadcn (cva + tokens), sem rodar o CLI, para não importar tokens e estilos que conflitam com os da seção 7. `components.json` aponta para `app/globals.css`. Toast via sonner. Seletor de tema próprio (sem Radix).
13. **pnpm 12 e `minimumReleaseAge`**: o pnpm 12 bloqueia pacotes muito recentes; ele adicionou `minimumReleaseAgeExclude` do `better-auth@1.7.26` e dependências em `pnpm-workspace.yaml` (versão publicada há poucos dias). Builds de `esbuild` liberados em `allowBuilds`. `sharp` funciona sem script de build.
14. **Husky**: `pre-commit` roda lint-staged, `commit-msg` roda commitlint e `pre-push` roda `pnpm check`.

### Hobby da Vercel (verificado em 19/11/2026)

Os Termos de Serviço da Vercel (seção 4, "Hobby Plan") dizem: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." O Lacus CRM sustenta uma atividade comercial (prospecção de clientes da Lacus Solutions), então o plano **Pro** é o enquadramento seguro para produção (US$ 20 por assento de desenvolvedor por mês). Decisão de negócio do Júlio. Limites úteis do Hobby: funções até 300 s, 100 deploys por dia, logs de runtime de 1 hora, 1.000.000 invocações por mês.

### Pendências da fase 1

- Criar o Vercel App (Client ID/Secret) e preencher `OWNER_VERCEL_USER_ID`/`OWNER_EMAIL`: sem isso o login real e a recusa de conta fora da allowlist não puderam ser exercitados contra a Vercel.
- Deploy de preview abrindo `/login`: depende de deploy (fora do escopo desta execução, sem push).
- Confirmar `pg_trgm` no Neon e "Sign-In Access" para contas Hobby no painel da Vercel.

## Fase 2: Leads, importação e dados reais

### Dependências (conferidas em 19/11/2026)

`@tanstack/react-virtual` 3.14.26, `nuqs` 2.10.3 (adapter `nuqs/adapters/next/app`, `createLoader` no servidor, `shallow: false` para a URL refazer a consulta) e `fractional-indexing` 4.0.0 (chaves de `deals.position`, usadas já pela importação). Papa Parse 5.7.1 já estava no projeto.

### Desvios

1. **Sem `@tanstack/react-table` nem `cmdk`.** Ordenação, filtro e paginação são do servidor (cursor); o que sobra é desenhar linhas virtualizadas, e o react-table v9 (API nova, `tableFeatures`) não ajudaria. A tabela é um `div role="table"` com `useVirtualizer`. `cmdk` é da paleta ⌘K (fase 8). Se a tabela ganhar seleção em lote ou reordenação de colunas, vale reavaliar.
2. **Dialog e drawer em `<dialog>` nativo**, sem Radix: foco preso, Esc, backdrop e `aria-modal` vêm do navegador. O evento `close` borbulha na árvore do React; o `Dialog` o contém com `stopPropagation` para um diálogo aninhado (Não contatar dentro do drawer) não fechar o pai.
3. **Drawer na URL.** Desktop: `/leads?lead=<id>` (o servidor renderiza o detalhe dentro do `<dialog>`); celular (< 768 px): o clique navega para a rota cheia `/leads/[id]`. O mesmo componente `LeadDetail` serve aos dois.
4. **Uma conversão só para tela, CSV e (fase 7) REST/MCP.** `lib/leads/csv.ts` define os 39 campos (cabeçalho, coluna do banco, tipo) e converte linha ↔ valores. A aba Dados do drawer e o formulário de criar lead enviam os cabeçalhos da planilha e passam por `prepareLeadInput`, então tela e importação nunca divergem. Campo ausente no arquivo não é tocado; campo vazio vira `null`/`false` ("Sim"/vazio → bool, "Dono responde avaliações" vazio → desconhecido).
5. **Dry-run = a importação real dentro de uma transação desfeita.** Cada linha roda num SAVEPOINT (um erro isola a linha). Por isso os números do dry-run são exatamente os da execução.
6. **"Reimportar não muda nada" é medido linha a linha**: o importador compara o valor convertido com o do banco (`changedFields`) e só grava o que difere; o `updated_at` das linhas iguais não se mexe. Data do contato compara só o dia em São Paulo (a planilha não tem hora).
7. **Aba Leads × Top leads.** O Top leads vence em prioridade, `session_url` e status. Para a reimportação da aba Leads não desfazer o que o Top leads fez (hoje: 2 leads `Perdido` na Leads e `Descartado` no Top leads), a importação da Leads **não toca no status de lead que já tem `priority`** (só o Top leads e a edição na tela definem prioridade). Efeito colateral: mudar o status de um lead priorizado na planilha Leads não chega ao CRM; use o Top leads ou a tela.
8. **Negociações da importação (SPEC 6.2 e D4)** só nascem para lead sem nenhuma negociação (aberta ou não), para a reimportação não duplicar. Status `discarded` não vira negociação. `lost` e `client` entram já fechadas (`lost`/`won`) na etapa correspondente, com histórico `source='import'`.
9. **Histórico de contato**: lead com "Data do contato" ganha uma interação `outbound` (`created_by='import'`, 12:00 de São Paulo, tipo pelo Canal, resumo "Contato por <canal>: <resposta>"); não duplica porque a importação procura `(lead, import, occurred_at)` antes de inserir. Lembretes não são criados a partir de "Próxima ação".
10. **`do_not_contact` nunca é aplicado pela importação.** O importador só lista candidatos (status Perdido/Descartado com recusa explícita em Observações, Resposta ou Próxima ação) em `.data/dnc-candidates.md` para o Júlio confirmar; ver `lib/leads/dnc.ts`.
11. **Testes de integração em banco próprio** (`<banco>_test`, criado e migrado por `tests/int/global-setup.ts`), porque a base de desenvolvimento agora guarda os dados reais. Cada teste roda numa transação revertida (`db.transaction` + `rollback`); os serviços usam `transaction()`, que dentro dela vira SAVEPOINT. Os testes de trigger da fase 1 continuam com cliente `pg` próprio.
12. **Edição inline otimista** com rollback e toast. Ordenação suportada só por colunas sem nulos no cursor (score, nome, atualizado, inclusão) ou com `coalesce` (último contato, prioridade); o cursor é o valor da ordenação mais o `id`.
13. **Importar em produção**: a caixa "Somente novos" já vem marcada com `NODE_ENV=production` (SPEC 6.2). O limite do upload é 10 MB por Route Handler (`/api/leads/import`), não Server Action.
14. **Rótulos centralizados** em `lib/leads/labels.ts` (status, site, ticket); o `StatusBadge` e o CSV usam a mesma fonte.

### Dados reais (somente leitura no Sheets, tudo em `.data/`, fora do git)

- A aba Leads tem **2 linhas de parâmetros do score** acima do cabeçalho (pontos e critérios mínimos); o CSV começa no cabeçalho. A planilha é viva (a rotina grava de 2 em 2 horas), então a contagem muda entre leituras: 52 leads na leitura final.
- "Uso da API": limite diário **30** na planilha. O seed de `places_daily_budget` passou de 150 para 30 na fase 3 (ver abaixo); a importação não muda a configuração.
- Fila: o status "Sem resultados" vira `done` com 0 leads. Datas misturam `dd/mm/aaaa` e ISO.
- Cidades: 6 linhas. As planilhas das outras cidades (Pato Branco, Toledo, Guarapuava, Jaraguá do Sul, Chapecó) só têm a fila, sem leads: não há o que importar delas hoje.
- O Top leads cita um lead (**Pinturas Arcanjo Miguel**, ID `b34554fc-0251-48ec-b6aa-4cc186006794`, nicho Reformas e construção civil) que **não está na aba Leads**: o importador não o cria (falta nicho no Top leads) e o relata como erro. Pedir ao Júlio para conferir a planilha.

### Pendências e riscos da fase 2

- Mensagem do WhatsApp (`?text=`), "Copiar mensagem", "Criar negociação" e "Criar lembrete" dependem de modelos (fase 4), funil (fase 3) e lembretes (fase 4); a barra abre o WhatsApp sem texto. O aviso "Registrar como abordado?" é um toast com ação.
- Mudar os pesos do score ainda não tem tela (Configurações é da fase 8): `recomputeAllScores` existe, testado, e fica pronto para essa tela e para o REST/MCP.
- A aba Interações lista, mas não cria interações; a criação rápida entra com a fase 3.

## Fase 3: Funil e interações

1. **`places_daily_budget` = 30** (era 150). É o limite que a planilha do Júlio já usa; o PLAN chutava 150. Mudou só o default do seed (`lib/validation/settings.ts`); o seed nunca sobrescreve, então a base de desenvolvimento foi ajustada à mão (`30` no lugar de `150`, valor que ninguém havia editado). Continua editável em Configurações (fase 8).
