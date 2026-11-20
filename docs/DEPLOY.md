# Deploy em produção (checklist)

Nada aqui foi executado: o deploy espera o Júlio. Siga na ordem. Domínio de produção: `https://lacuscrm.juliolmuller.com`.

## 0. Plano da Vercel (Hobby x Pro)

Os Termos da Vercel limitam o plano **Hobby** a uso pessoal e não comercial. O CRM sustenta a atividade comercial da Lacus Solutions, então **Pro** é o enquadramento seguro (decisão de negócio do Júlio; ver "Hobby da Vercel" em `docs/DECISIONS.md`). Tecnicamente tudo cabe no Hobby: funções com `maxDuration = 60` (limite do Hobby: 300 s) e o agendamento por Schedule (Hobby: intervalo mínimo de 15 min e 5.000 execuções por mês; o `vercel.json` usa 15 por dia). No Pro o jitter do Schedule é menor.

## 1. Projeto na Vercel e banco no Neon

1. Importe o repositório como projeto Vercel (framework Next.js; build `pnpm build`, Node 24).
2. Em **Storage**, adicione o **Neon** pela integração da Vercel. Ela cria `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED` (conexão direta) no projeto. Confirme que existem em **Production** (e em Preview, se quiser banco nos previews; use um branch do Neon para isso, nunca o de produção).
3. **Backup antes de migrar**: no painel do Neon, **Branches > Create branch** a partir de `main` (nome sugerido `backup-AAAA-MM-DD`). Só então rode as migrations.
4. Migrar e semear com a conexão direta, da sua máquina:

   ```bash
   DATABASE_URL_UNPOOLED='<string unpooled do Neon>' DATABASE_URL='<a mesma>' pnpm db:migrate
   DATABASE_URL='<string do Neon>' pnpm db:seed
   ```

   Rollback, se precisar: `pnpm db:rollback 1` (usa `drizzle/down/*.down.sql`) ou restaure o branch de backup.

5. Dados reais: `pnpm db:import --insert-only` com os CSVs de `.data/` apontando para o Neon (o modo "somente novos" é o padrão seguro em produção). Confira `.data/import-report.json`.

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

Escopos `openid email profile`. Se possível, em "Sign-In Access" restrinja a "Members of the team". No primeiro login em produção, preencha `OWNER_VERCEL_USER_ID` com o `sub` (em produção o acesso negado não o mostra; pegue-o no login local, que mostra) e faça redeploy.

## 5. Google Calendar

Passo a passo completo em `docs/GOOGLE.md`. Resumo do que fazer para produção:

1. Google Auth Platform > Público-alvo > **Publicar app** (status **In production**). Em Testing o refresh token expira em 7 dias.
2. Cliente OAuth "Aplicativo da Web" com o URI exato `https://lacuscrm.juliolmuller.com/api/google/callback` (mais o de localhost).
3. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel (Production) e redeploy.
4. Em `https://lacuscrm.juliolmuller.com/configuracoes#google`, **Conectar** e aceite o aviso "app não verificado" (Avançado > Acessar). Crie um lembrete e confira o evento no calendário "Lacus CRM – Follow-ups".

## 6. Schedule dos follow-ups

O `vercel.json` já declara o Schedule `followups-hourly` (`0 7-21 * * *`, `America/Sao_Paulo`, `POST /api/jobs/followups`) e o cron diário de reserva (`0 10 * * *`, UTC). Depois do primeiro deploy:

1. Projeto > **Settings > Cron Jobs / Schedules**: confirme que o Schedule aparece e está **ativo**.
2. Teste à mão (usa `CRON_SECRET` ou um PAT com `write`):

   ```bash
   curl -X POST https://lacuscrm.juliolmuller.com/api/jobs/followups \
     -H "Authorization: Bearer $CRON_SECRET" -H "X-Run-Id: deploy-smoke-1"
   ```

   Esperado: 200 com o resumo do job; repetir com o mesmo `X-Run-Id` não faz nada.

3. Se os Schedules estiverem confirmados, remova o bloco `crons` do `vercel.json` (ele é só reserva).

## 7. Conectores do claude.ai e tokens

1. Em `https://lacuscrm.juliolmuller.com/configuracoes#tokens`, crie um token (`read`+`write`) para o Claude Code e teste `claude mcp add` (comandos em `docs/OPERACAO.md`).
2. Adicione os dois conectores do claude.ai e agende a rotina seguindo `docs/ROTINA.md` (precisa da URL pública HTTPS).
3. Confira os conectores em **Configurações > Conectores autorizados**.

## 8. Smoke pós-deploy

- [ ] `https://lacuscrm.juliolmuller.com/login` abre; entrar com a Vercel leva ao painel; outra conta recebe "Acesso negado".
- [ ] `/`, `/leads`, `/funil`, `/lembretes`, `/fila`, `/configuracoes` carregam com os dados importados.
- [ ] Criar um lead, uma negociação e um lembrete; o lembrete vira evento no Google Calendar; concluir o apaga.
- [ ] `Ctrl+K` abre a paleta e acha um lead por nome.
- [ ] `GET /.well-known/oauth-authorization-server/api/auth` e `/.well-known/oauth-protected-resource/api/mcp` respondem 200 com URLs `https://lacuscrm.juliolmuller.com`.
- [ ] `curl -i -X POST https://lacuscrm.juliolmuller.com/api/mcp` sem token devolve 401 com `WWW-Authenticate` apontando o resource metadata.
- [ ] `curl -H "Authorization: Bearer <PAT>" https://lacuscrm.juliolmuller.com/api/v1/leads?limit=1` devolve 200.
- [ ] `POST /api/jobs/followups` (passo 6) responde 200.
- [ ] No celular: instalar o app (Android: menu "Instalar app"; iOS: Compartilhar > Adicionar à Tela de Início); abrir offline mostra `/~offline` com os dados do último snapshot.
- [ ] Uma execução manual da rotina (`docs/ROTINA.md`): item da Fila vira "Concluído" e o painel de uso da API conta as requisições.
- [ ] Vercel > Logs sem erros 5xx depois dessas chamadas.
