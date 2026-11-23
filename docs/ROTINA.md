# Rotina de prospecção (claude.ai)

A rotina é uma tarefa agendada no claude.ai que prospecta uma região e um nicho por execução. Ela fala com o CRM por dois conectores OAuth. A lógica de busca (Places API e filtros F0 a F8) continua na rotina; o CRM só guarda a fila, o uso da API e os leads.

## 1. Adicionar os conectores personalizados

Pré-requisito: o app publicado em `https://lacuscrm.juliolmuller.com` e você logado nele (login Vercel).

1. No claude.ai, abra **Configurações > Conectores** (em planos de equipe, só o dono da organização adiciona).
2. Clique em **Adicionar conector personalizado**.
3. Conector completo: nome `Lacus CRM`, URL `https://lacuscrm.juliolmuller.com/api/mcp`. Deixe client ID e secret em branco (o CRM usa Client ID Metadata Document). Clique em **Adicionar**.
4. O claude.ai abre a tela de login (Vercel) e depois a tela **Autorizar acesso** do CRM com os escopos `read`, `write` e `prospecting`. Clique em **Permitir**.
5. Repita para o conector da rotina: nome `Lacus CRM Prospecção`, URL `https://lacuscrm.juliolmuller.com/api/mcp/prospecting`. Aqui o acesso é só `prospecting`.
6. Confira em **Configurações do CRM > Conectores autorizados**: os dois devem aparecer. Para cortar o acesso, clique em Revogar (vale em até 15 minutos).
7. Teste numa conversa com o conector ligado: "Use `api_usage_today` e diga quanto resta". Deve responder `{requestsToday, budget, remaining}`.

## 2. Prompt da tarefa agendada

Crie a tarefa agendada (por exemplo, a cada 2 horas em dias úteis) com só o conector `Lacus CRM Prospecção` e a Places API. Prompt:

```text
Você é a rotina de prospecção do Lacus CRM. Execute UMA região+nicho e pare.

runId base: use a hora cheia UTC no formato AAAA-MM-DDTHH (ex.: 2026-11-20T14). Depois do passo 1,
o runId final é "<base>-pos<position>" (ex.: 2026-11-20T14-pos12). Use exatamente o mesmo runId em
TODAS as chamadas abaixo. Se uma chamada falhar por rede ou timeout, repita-a com o mesmo runId:
é seguro, nada duplica.

0. Confirme que você tem acesso à Places API neste ambiente (chave ou ferramenta). Se não tiver,
   responda "sem acesso à Places API" e termine SEM chamar nenhuma ferramenta do CRM: assim o item
   da fila não é pego nem marcado como erro.
1. Chame queue_claim_next com {runId: "<base>"}. Se devolver item nulo, responda "fila vazia" e
   termine. Guarde position, regionLabel, nicheName e os dados do nicho (termos, ticket, notas).
   Daqui em diante, o runId é "<base>-pos<position>". (A chamada do passo 1 usa o runId base; se
   precisar repeti-la, repita com o runId base.)
2. Chame api_usage_today. Se remaining for menor que 10 (uma execução usa de 2 a 8 requisições;
   o limite diário é 30), NÃO continue: chame queue_complete com status "error", leadsAdded 0 e notes
   "orçamento insuficiente (remaining=N)" e termine.
3. Faça a busca na Places API para regionLabel + nicho e aplique os filtros F0 a F8 como de
   costume. Conte cada chamada à API (requests). Monte até 20 leads por lote com: name, nicheName
   (exatamente nicheName do item), regionLabel (exatamente o do item), placeId, phone, address,
   mapsRating, mapsReviews, mapsUrl, mapsCategory, digitalSignals, websiteUrl, websiteStatus,
   instagram, businessSummary, pitch, hasWhatsapp, hasActiveAds, instagramActive.
4. Chame crm_upsert_leads com {runId, queuePosition: position, leads: [...]} (um lote por vez,
   até 20 leads). Registre quantos vieram em created e quantos em skipped (e os motivos).
5. Chame api_usage_log com {runId, queuePosition: position, requests: <total de chamadas à Places>,
   leadsSaved: <total created>, note: "<resumo curto>"}.
6. Chame queue_complete com {position, runId, status: "done", leadsAdded: <total created>,
   notes: "<resumo curto>"}. Se algo falhou de forma definitiva, use status "error" e explique em notes.

Regras: nunca invente dados; não repita o passo 1 com outro runId; se qualquer ferramenta
responder erro de escopo (403) ou de autenticação (401), pare e informe. Termine com uma linha:
"pos <position> <regionLabel> / <nicheName>: <created> criados, <skipped> ignorados, <requests> requisições".
```

Notas do fluxo:

- O `runId` base é a hora cheia UTC: duas execuções na mesma hora reaproveitam o mesmo item e não mudam nada (`queue_complete` só altera item pendente). Para repetir um teste, espere a próxima hora ou use outro `runId` base.
- O `runId` torna tudo idempotente: repetir `queue_claim_next` devolve o mesmo item; repetir `crm_upsert_leads` não duplica nem altera nada; `api_usage_log` é único por `runId`; `queue_complete` só muda item ainda pendente.
- Se a execução morrer no meio, o lease de 30 minutos solta o item; uma nova execução (outro `runId` base) pega o próximo pendente. Para refazer um item concluído com erro, use **Marcar como pendente** na tela Fila.
- Itens suprimidos ou marcados "Não contatar" voltam em `skipped` e nunca são recriados; campos escritos por você (status, notas, próxima ação etc.) nunca são sobrescritos.

## 3. O que só você pode testar (⏳)

1. Adicionar os dois conectores (passo 1) e ver o fluxo OAuth fechar: login Vercel, **Autorizar acesso**, conector ativo. Requer a URL pública HTTPS.
2. Rodar a tarefa uma vez manualmente e conferir na tela **Fila** o item `Concluído`, "Leads adicionados" e o painel de uso da API.
3. Rodar a mesma tarefa de novo com o mesmo `runId` (peça no prompt "use o runId 2026-11-20T14-pos12") e conferir que nada mudou.
