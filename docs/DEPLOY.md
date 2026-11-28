# Deploy em produção (checklist)

Domínio de produção: `https://lacuscrm.juliolmuller.com`. Todo push em `main` gera um deploy de produção (projeto Vercel ligado ao GitHub); branches e PRs geram previews.

**Estado em 22/11/2026**

- Feito: projeto na Vercel e Neon (passo 1) com migrations, seed e importação dos dados reais (53 leads, 20 negociações, 216 itens de fila); variáveis de ambiente (passo 2) e `OWNER_VERCEL_USER_ID`; domínio (passo 3); Vercel App com as callbacks de produção (passo 4); deploy de produção; Schedule `followups-hourly` ativo (passo 6); login e painel funcionando em produção; Google Calendar conectado em produção (passo 5), com evento criado e apagado ao concluir o lembrete, verificado no calendário.
- Pendente: tokens e conectores do claude.ai (passo 7) e os itens restantes do smoke (passo 8). O plano Hobby foi decidido (passo 0).

Os passos abaixo seguem como roteiro de referência (por exemplo, para refazer o ambiente).

## 0. Plano da Vercel: Hobby (decidido)

**Decisão do Júlio (21/11/2026): o projeto permanece no plano Hobby.** Os Termos da Vercel limitam o Hobby a uso pessoal e não comercial; o Júlio não interpreta o uso do CRM como comercial e **assume o risco** dessa escolha. Assunto encerrado, sem nova ação. Se a Vercel restringir a conta ou os termos mudarem, o caminho é migrar para o Pro (mesma configuração).

Tecnicamente tudo cabe no Hobby: funções com `maxDuration = 60` (limite do Hobby: 300 s) e o agendamento por Schedule (Hobby: intervalo mínimo de 15 min e 5.000 execuções por mês; o `vercel.json` usa 15 por dia). No Pro o jitter do Schedule é menor.

## 1. Projeto na Vercel e banco no Neon

1. Importe o repositório como projeto Vercel (framework Next.js, Node 24). O `vercel.json` define o build como `bun run vercel-build` (`next build` e, só em Production, as migrations do passo 4); não é preciso configurar nada no painel.
2. Em **Storage**, adicione o **Neon** pela integração da Vercel. Ela cria `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED` (conexão direta) no projeto. Confirme que existem em **Production** (e em Preview, se quiser banco nos previews; use um branch do Neon para isso, nunca o de produção). No assistente do Neon: marque só **Production e Preview** (Development não: um `vercel env pull` poderia levar as credenciais reais para o `.env.local`), deixe **Neon Auth**, **Data API** e **Realtime** desligados (o login é o Better Auth e o app não usa realtime) e escolha a região próxima das funções (padrão da Vercel: `iad1`/`us-east-1`; em `sa-east-1`, ajuste a região das funções para `gru1`). Se a integração criar `VITE_NEON_AUTH_URL` e `NEON_AUTH_BASE_URL`, o app não as usa; podem ser removidas. Não sobrescreva `DATABASE_URL`/`DATABASE_URL_UNPOOLED` à mão: elas são geridas pela integração, e **Preview e Production apontam para o mesmo banco** enquanto o branch por deploy de preview não for ativado.
3. **Backup**: só é obrigatório quando o banco **já tem dados** (antes de importar leads reais sobre um banco em uso, antes de migrations que mexam em tabelas com dados e, depois, de tempos em tempos, com `pg_dump` da conexão unpooled guardado fora do Neon e do repositório). Num banco recém-criado e vazio, pule: migrations e seed se refazem em minutos e os leads vêm dos CSVs. Para criar o backup: no painel do Neon, **Branches > Create branch** a partir de `main` (nome sugerido `backup-AAAA-MM-DD`, "Current data"). Confira também a janela de restauração por ponto no tempo do seu plano (Settings > Storage).
4. **Migrations e seed.**

   **Automático em Production.** O build roda `next build && bun scripts/migrate.ts --deploy`. Depois que o `next build` passa e antes de a Vercel promover o deploy, o script aplica as migrations pendentes com a conexão direta (`DATABASE_URL_UNPOOLED`, obrigatória em Production: o pooler quebra o advisory lock). Detalhes:

   - **Só Production migra.** Com `VERCEL_ENV` diferente de `production` (Preview, Development), o script imprime `Migrations não aplicadas: VERCEL_ENV=<x> (só produção migra)` e sai sem abrir conexão. Preview e Production compartilham o mesmo banco enquanto o branch por preview não for ativado, então um preview nunca migra.
   - **Falha derruba o deploy.** Qualquer erro sai com código 1 e a Vercel não promove o deploy. O migrator do drizzle aplica todas as pendentes **numa única transação**: se uma falha, nenhuma é aplicada. O marcador `-- lacus:manual` **não** contorna isso: o `db:migrate` à mão usa o mesmo migrator, também em transação. Instruções que não rodam em transação (por exemplo `CREATE INDEX CONCURRENTLY`) não são suportadas por este fluxo, nem no deploy nem à mão; rode-as direto no `psql` com a conexão unpooled, fora das migrations, e deixe a migration do repositório sem o `CONCURRENTLY` (pode manter o `IF NOT EXISTS`) ou sem a instrução: `CREATE INDEX CONCURRENTLY IF NOT EXISTS` também falha dentro da transação, porque o Postgres checa a restrição de transação antes de ver se o índice existe.
   - **Sem corrida entre deploys.** O script segura um advisory lock de sessão (espera até 120 s, ajustável com `MIGRATIONS_LOCK_TIMEOUT_MS`; estourou, falha com `Outra migração está em andamento (lock ocupado)`). O segundo deploy, ao entrar, já não encontra nada pendente.
   - **Janela de código antigo com schema novo.** A migration roda antes da promoção, então o deploy anterior atende por instantes com o schema novo. Toda migration automática precisa ser compatível com o código que está em produção (expandir, depois contrair: adicione colunas e tabelas num deploy, remova o que ficou sem uso em outro).
   - **Migrations manuais.** Uma migration que reescreve ou apaga dados, ou que o código anterior não tolera, leva a linha `-- lacus:manual` no `.sql` (a `0005_english_enum_values` está numa lista fixa no código, porque migrations existentes não se editam). O build **não aplica nenhuma** e falha antes de mexer no banco, listando as tags. O passo manual: (1) crie o branch de backup no Neon (passo 3); (2) rode `bun run db:migrate` da sua máquina, com a URL unpooled de produção, como abaixo; (3) faça o redeploy, que não encontra mais nada pendente. O `db:migrate` local ignora o marcador: rodá-lo à mão é o passo explícito.

   **Manual**, para a primeira configuração, o seed e as migrations `-- lacus:manual`, da sua máquina com a conexão direta:

   ```bash
   DATABASE_URL_UNPOOLED='<string unpooled do Neon>' DATABASE_URL='<a mesma>' bun run db:migrate
   DATABASE_URL='<string do Neon>' bun run db:seed
   ```

   Para conferir o estado do banco sem alterar nada: `DATABASE_URL_UNPOOLED='<string unpooled do Neon>' bun run db:status` (diz se há migrations pendentes ou se o banco está à frente do código).

   Histórico: a suspeita da issue #11 (26/11/2026) era que o código com `ticketPoints` em inglês foi ao ar antes da `0005` no Neon, e `crm_update_lead` e `crm_save_diagnosis` falharam ao ler a configuração antiga (causa provável, não confirmada em produção). A [issue #17](https://github.com/juliolmuller/lacus-crm/issues/17) fechou essa lacuna: o deploy aplica o que for seguro e para, com instruções, no que exige passo manual. A `0005`, se ainda estiver pendente, falha o primeiro build de Production depois do merge (veja o passo 9); é o comportamento esperado.

   **Pulo de emergência.** Se o passo automático estiver bloqueando um deploy urgente (por exemplo, para reverter código), defina `SKIP_DB_MIGRATIONS=1` em Production e faça o redeploy: o build imprime `ATENÇÃO: migrations puladas por SKIP_DB_MIGRATIONS` e segue sem migrar. **Remova a variável depois**, ou nenhum deploy volta a migrar.

   **Rollback.** `bun run db:rollback 1` (usa `drizzle/down/*.down.sql`), com a URL unpooled de produção, ou restaure o branch de backup do Neon. O "instant rollback" da Vercel volta o código, **não** desfaz migrations: se o código antigo não tolera o schema novo, desfaça a migration antes.

5. Dados reais: `bun run db:import --insert-only` com os CSVs de `.data/` apontando para o Neon (o modo "somente novos" é o padrão seguro em produção). Confira `.data/import-report.json`.

## 2. Variáveis de ambiente

| Variável                                  | Local (`.env.local`)      | Preview                                                          | Produção                                                                       |
| ----------------------------------------- | ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | Postgres do Docker        | integração Neon (branch de preview)                              | integração Neon                                                                |
| `DATABASE_URL_UNPOOLED`                   | vazio                     | integração Neon                                                  | integração Neon                                                                |
| `BETTER_AUTH_SECRET`                      | `openssl rand -base64 32` | outro valor                                                      | outro valor (nunca reutilize)                                                  |
| `BETTER_AUTH_URL`                         | `http://localhost:3000`   | URL do preview (o app já aceita `VERCEL_BRANCH_URL` como origem) | `https://lacuscrm.juliolmuller.com`                                            |
| `NEXT_PUBLIC_APP_URL`                     | `http://localhost:3000`   | URL do preview                                                   | `https://lacuscrm.juliolmuller.com`                                            |
| `VERCEL_CLIENT_ID` / `_SECRET`            | do Vercel App             | do Vercel App                                                    | do Vercel App (obrigatórias)                                                   |
| `OWNER_VERCEL_USER_ID` (ou `OWNER_EMAIL`) | o seu `sub`               | o seu `sub`                                                      | o seu `sub` (obrigatória)                                                      |
| `GOOGLE_CLIENT_ID` / `_SECRET`            | do Google Cloud           | não usadas (a tela mostra "Disponível apenas em produção")       | do Google Cloud                                                                |
| `TOKEN_ENCRYPTION_KEY`                    | `openssl rand -base64 32` | outro valor                                                      | outro valor; **guarde uma cópia**: perder a chave invalida a conexão do Google |
| `CRON_SECRET`                             | `openssl rand -hex 24`    | idem                                                             | idem (a Vercel o envia como Bearer nos Schedules e crons)                      |
| `APP_TIMEZONE`                            | `America/Sao_Paulo`       | idem                                                             | idem                                                                           |
| `E2E_AUTH_BYPASS`                         | `0` (ou `1` só em testes) | **nunca**                                                        | **nunca**                                                                      |

**Preview:** `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` precisam ser **URLs válidas**; o texto `VERCEL_BRANCH_URL` não vale (o app só usa `VERCEL_BRANCH_URL` para ampliar as origens confiáveis, não para derivar a URL base). Sem elas, um deploy de preview falha na validação do ambiente. Defina uma URL fixa para o preview ou ajuste o código antes de usar previews.

Variáveis com o mesmo valor em Preview e Production (`APP_TIMEZONE`, `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `OWNER_VERCEL_USER_ID`) ficam numa única entrada com os dois ambientes marcados. Segredos (`*_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`) entram como **Sensitive**: depois de salvos não podem ser lidos, então guarde uma cópia no `.env.production`/`.env.preview` local (ignorados pelo git).

`E2E_AUTH_BYPASS` e `E2E_PROD_BUILD` existem só para os testes; o bypass é recusado quando `VERCEL_ENV` está definido. O app valida o ambiente no boot e lista o que falta.

## 3. Domínio e DNS

1. Projeto > **Settings > Domains** > adicione `lacuscrm.juliolmuller.com`.
2. No DNS da zona `juliolmuller.com` (Hostinger), crie o registro que a Vercel indicar (normalmente `CNAME lacuscrm -> cname.vercel-dns.com`, ou o valor específico mostrado no painel). Aguarde "Valid Configuration" e o certificado.
3. Defina `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` de produção como `https://lacuscrm.juliolmuller.com` **antes** do primeiro deploy (os metadados OAuth e a callback do Google derivam deles) e faça um redeploy se mudar depois.

## 4. Vercel App (Sign in with Vercel)

No app **Lacus CRM** (Settings > Apps), registre as callbacks:

| Ambiente | Callback                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Local    | `http://localhost:3000/api/auth/callback/vercel`                                                      |
| Produção | `https://lacuscrm.juliolmuller.com/api/auth/callback/vercel`                                          |
| Preview  | selecione o projeto Vercel no campo de callback (a doc diz que cobre os previews; confirme no painel) |

Use **um app só** para local, produção e preview (as três callbacks acima, no mesmo app; as credenciais e o `OWNER_VERCEL_USER_ID` são iguais nos ambientes). Na página **Manage** do app, habilite os escopos **Email** e **Profile** (`openid` já vem ativo): se faltarem, o login volta para `/login?error=invalid_scope`. O app pede `openid email profile`. Se possível, em "Sign-In Access" restrinja a "Members of the team". No primeiro login em produção, preencha `OWNER_VERCEL_USER_ID` com o `sub` (em produção o acesso negado não o mostra; pegue-o no login local, que mostra: com `OWNER_VERCEL_USER_ID` e `OWNER_EMAIL` vazias, entre em `http://localhost:3000/login` e copie o valor de "Acesso negado. sub recebido: …") e faça redeploy.

## 5. Google Calendar (concluído em 22/11/2026)

Passo a passo completo em `docs/GOOGLE.md`. Resumo do que fazer para produção:

1. Google Auth Platform > Público-alvo > **Publicar app** (status **In production**). Em Testing o refresh token expira em 7 dias.
2. Cliente OAuth "Aplicativo da Web" com o URI exato `https://lacuscrm.juliolmuller.com/api/google/callback` (mais o de localhost).
3. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel (Production) e redeploy.
4. Em `https://lacuscrm.juliolmuller.com/configuracoes#google`, **Conectar** e aceite o aviso "app não verificado" (Avançado > Acessar). Crie um lembrete e confira o evento no calendário "Lacus CRM – Follow-ups". O calendário pode ser renomeado no Google Calendar; o CRM o reaproveita pelo id.

## 6. Schedule dos follow-ups

O `vercel.json` já declara o Schedule `followups-hourly` (`0 7-21 * * *`, `America/Sao_Paulo`, `POST /api/jobs/followups`) e o cron diário de reserva (`0 10 * * *`, UTC). Depois do primeiro deploy:

1. Projeto > **Settings > Cron Jobs / Schedules**: confirme que o Schedule aparece e está **ativo** (conferido em 21/11/2026 com `vercel schedules ls`: `followups-hourly`, estado `active`).
2. Teste à mão (usa `CRON_SECRET` ou um PAT com `write`):

   ```bash
   curl -X POST https://lacuscrm.juliolmuller.com/api/jobs/followups \
     -H "Authorization: Bearer $CRON_SECRET" -H "X-Run-Id: deploy-smoke-1"
   ```

   Esperado: 200 com o resumo do job; repetir com o mesmo `X-Run-Id` não faz nada.

3. Se os Schedules estiverem confirmados, remova o bloco `crons` do `vercel.json` (ele é só reserva).

## 7. Conectores do claude.ai e tokens

1. Em `https://lacuscrm.juliolmuller.com/configuracoes#tokens`, crie um token (`read`+`write`) para o Claude Code e teste `claude mcp add` (comandos em `docs/OPERATIONS.md`).
2. Adicione os dois conectores do claude.ai e agende a rotina seguindo `docs/ROTINA.md` (precisa da URL pública HTTPS).
3. Confira os conectores em **Configurações > Conectores autorizados**.

## 8. Smoke pós-deploy

- [ ] `https://lacuscrm.juliolmuller.com/login` abre; entrar com a Vercel leva ao painel; outra conta recebe "Acesso negado".
- [ ] `/`, `/leads`, `/funil`, `/lembretes`, `/fila`, `/configuracoes` carregam com os dados importados.
- [ ] Criar um lead e uma negociação.
- [x] Criar um lembrete: vira evento no Google Calendar; concluir o apaga (verificado em 22/11/2026).
- [ ] `Ctrl+K` abre a paleta e acha um lead por nome.
- [x] `GET /.well-known/oauth-authorization-server/api/auth` e `/.well-known/oauth-protected-resource/api/mcp` respondem 200 com URLs `https://lacuscrm.juliolmuller.com` (verificado em 21/11/2026).
- [x] `curl -i -X POST https://lacuscrm.juliolmuller.com/api/mcp` sem token devolve 401 com `WWW-Authenticate` apontando o resource metadata (verificado em 21/11/2026).
- [ ] `curl -H "Authorization: Bearer <PAT>" https://lacuscrm.juliolmuller.com/api/v1/leads?limit=1` devolve 200.
- [ ] `POST /api/jobs/followups` (passo 6) responde 200.
- [ ] No celular: instalar o app (Android: menu "Instalar app"; iOS: Compartilhar > Adicionar à Tela de Início); abrir offline mostra `/~offline` com os dados do último snapshot.
- [ ] Uma execução manual da rotina (`docs/ROTINA.md`): item da Fila vira "Concluído" e o painel de uso da API conta as requisições.
- [ ] Vercel > Logs sem erros 5xx depois dessas chamadas.

## 9. Problemas conhecidos

- **Build de Production falhou com `migration(s) manual(is) pendente(s)`**: há migration marcada `-- lacus:manual` (ou a `0005`) ainda não aplicada. Nada foi alterado no banco. Faça o backup (passo 3), rode `bun run db:migrate` da sua máquina com a URL unpooled de produção e redeploy.
- **Build de Production falhou com `Outra migração está em andamento (lock ocupado)`**: outro deploy segurava o lock por mais de 120 s. Espere ele terminar e faça o redeploy.
- **Build de Production falhou com `DATABASE_URL_UNPOOLED é obrigatória`**: a variável não está exposta ao build em Production (passo 1.2).
- **`/login?error=invalid_scope`**: faltam os escopos **Email** e **Profile** habilitados em Manage no app da Vercel (passo 4).
- **`Acesso negado. sub recebido: …`**: `OWNER_VERCEL_USER_ID` (ou `OWNER_EMAIL`) não confere ou está vazia. Em desenvolvimento a tela mostra o `sub`; copie-o para o `.env.local` e para a Vercel (Production e Preview) e reinicie o `bun run dev` (o `.env.local` só é lido na subida).
- **`bun run dev` devolve 500 em todas as rotas com `Turbopack Error … task is missing in memory or persistent storage`**: cache do Turbopack corrompido (acontece depois de interromper o servidor durante a escrita ou de mover pastas). Pare o servidor, apague `.next` (só cache) e suba de novo.
- **`Variáveis de ambiente inválidas` nos logs da Vercel**: o deploy foi criado antes de as variáveis existirem. Variáveis novas só valem em deploys novos; faça um redeploy (`vercel redeploy <url-do-deploy> --scope <time>`).
- **`vercel env rm` não remove**: a CLI pede confirmação explícita. Mostre o efeito a quem decide e rode o comando indicado, com `--confirm-name <NOME>`.
