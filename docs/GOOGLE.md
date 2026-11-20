# Google Calendar: configuração e teste manual

O CRM cria um calendário próprio, "Lacus CRM – Follow-ups", na conta Google do Júlio e mantém nele um evento por lembrete aberto. Lembrete concluído ou cancelado apaga o evento. O CRM nunca lê nem altera outros calendários.

## Escopos (verificado na documentação do Google em 19/11/2026)

- `https://www.googleapis.com/auth/calendar.app.created`: segundo a página de autorização da Calendar API, "faz calendários secundários e vê, cria, altera e apaga eventos neles". As referências de `calendars.insert`, `calendars.get` e `events.*` listam esse escopo.
- `openid email`: só para mostrar a conta conectada.
- Limite conhecido: `calendarList.list` **não** aceita `calendar.app.created` (só `calendar`, `calendar.readonly`, `calendar.calendarlist` e `calendar.calendarlist.readonly`). Por isso o CRM guarda o `calendar_id` e o reaproveita ao reconectar; ele não procura o calendário pelo nome.
  Se a linha de `google_connections` for apagada do banco, a próxima conexão cria um calendário novo e o antigo fica órfão (apague-o à mão em calendar.google.com).

## Passo a passo no Google Cloud

Use o projeto Google Cloud que você já tem (não crie outro).

1. **APIs e serviços → Biblioteca**: procure por "Google Calendar API" e clique em **Ativar**.
2. **Google Auth Platform** (menu do console). Se for a primeira vez, clique em **Primeiros passos**.
   - **Identidade visual (Branding)**: nome do app ("Lacus CRM"), e-mail de suporte e e-mail do desenvolvedor.
   - **Público-alvo (Audience)**: tipo de usuário **Externo**. Em "Usuários de teste", adicione o seu Gmail enquanto o app estiver em teste.
   - **Acesso a dados (Data Access)**: **Adicionar ou remover escopos** e marque `.../auth/calendar.app.created`. Os escopos `openid` e `email` já são básicos.
3. **Clientes (Clients) → Criar cliente**: tipo **Aplicativo da Web**, nome "Lacus CRM". Em **URIs de redirecionamento autorizados** informe exatamente:
   - `http://localhost:3000/api/google/callback`
   - `https://lacuscrm.juliolmuller.com/api/google/callback`

   Sem curinga: por isso a conexão só funciona em local e em produção (em preview a tela mostra "Disponível apenas em produção").

4. Copie o **ID do cliente** e a **chave secreta** para as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (`.env.local` e, em produção, as variáveis do projeto na Vercel). Nunca commite esses valores.
5. **Publicar o app** (Público-alvo → **Publicar app** / "In production"). Veja a seção seguinte.

## Por que publicar em "In production"

Política do Google (Google Auth Platform, "Publishing status", consultada em 19/11/2026):

- Em **Testing**, a autorização de um usuário de teste expira em **7 dias**, e o refresh token também (a exceção é o app que pede só nome, e-mail e perfil, o que não é o caso). Na prática o Calendar pararia de sincronizar toda semana, com `invalid_grant`.
- Em **In production**, o app fica disponível para qualquer conta Google e o refresh token não expira por prazo. Para uso pessoal, a tela "O Google não verificou este app" é aceitável: clique em **Avançado → Acessar Lacus CRM (não seguro)**. Apps não verificados têm teto de 100 usuários novos; aqui é 1.
- A verificação do Google é exigida para escopos sensíveis/restritos e para exibir nome/logo; não é necessária para uso pessoal.

Se mesmo assim o Google revogar o acesso (senha trocada, acesso removido em myaccount.google.com/permissions, 6 meses sem uso), o CRM detecta `invalid_grant`, marca a conexão como `needs_reauth` e mostra o banner "Reconectar".

## Variáveis de ambiente

| Variável                                   | Uso                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | credenciais do cliente OAuth                                                                           |
| `TOKEN_ENCRYPTION_KEY`                     | cifra AES-256-GCM dos tokens (`openssl rand -base64 32`); os tokens ficam como `v1.<iv>.<tag>.<texto>` |
| `NEXT_PUBLIC_APP_URL`                      | base do redirect (`<url>/api/google/callback`) e dos links dos eventos                                 |
| `CRON_SECRET`                              | autentica `POST /api/jobs/followups`                                                                   |

## Teste manual (⏳ depende das credenciais reais)

1. `pnpm dev`, abra `/configuracoes#google` e clique em **Conectar Google Calendar**. Autorize (aceite a tela de app não verificado, se aparecer). Volta para `/configuracoes?google=connected`, com status "Conectado (seu e-mail)".
2. No Google Calendar, confira que existe o calendário **Lacus CRM – Follow-ups** (fuso America/Sao_Paulo).
3. **Criar**: em `/leads/<id>` → aba **Lembretes**, crie "Teste" com "Amanhã, 9h30". Em poucos segundos o evento "Follow-up: <lead> – Teste" aparece no calendário, com descrição (próxima ação, telefone, link do WhatsApp, link do lead) e avisos de 10 min e na hora. O ícone do lembrete em `/lembretes` fica verde (sincronizado).
4. **Editar**: em `/lembretes` → **Editar**, mude o título e a hora. O evento muda de nome e horário no Calendar (sem duplicar).
5. **Concluir**: **Concluir**. O evento some do Calendar e o lembrete vai para **Concluídos**.
6. **Cancelar** (Editar → Cancelar lembrete) e **excluir o lead** também removem o evento.
7. **Apagado no Google**: crie um lembrete, apague o evento direto no Calendar e edite o lembrete no CRM: o evento é recriado (404/410 → recria).
8. **Re-sincronizar tudo** em `/configuracoes#google`: com eventos duplicados no calendário para o mesmo lembrete, sobra um só.
9. **invalid_grant**: em myaccount.google.com/permissions remova o acesso do app, crie ou edite um lembrete e rode o job (ou espere). O banner "O Google Calendar precisa ser reconectado" aparece; **Reconectar** reativa e os lembretes pendentes sincronizam.
10. **Job**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "X-Run-Id: teste-1" http://localhost:3000/api/jobs/followups` devolve `duplicate:false`; repetir com o mesmo `X-Run-Id` devolve `{"duplicate":true}`.

Os testes automatizados (`pnpm test:int`) cobrem os mesmos passos contra um Google simulado (fetch em memória): criar, editar, concluir, 404/410, backoff, `invalid_grant` e re-sincronização.
