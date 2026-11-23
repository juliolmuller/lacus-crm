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

Crie a tarefa agendada (por exemplo, a cada 2 horas em dias úteis) com só o conector `Lacus CRM Prospecção` (a Places API é chamada por um script, ver o prompt). Prompt:

```text
Tarefa de prospecção da LACUS Solutions, um freelancer de tecnologia que vende sites e melhorias de presença online para pequenos negócios de serviço, sempre de forma remota. Execute tudo sem pedir confirmação.

Esta tarefa roda a cada 2 horas. Cada execução processa UMA combinação região + nicho da fila do CRM, se ainda houver saldo de requisições à Places API no dia. O teto diário é compartilhado entre todas as execuções.

OBJETIVO: entregar POUCOS LEADS BONS, não muitos leads fracos. Um lead só é útil se (1) existe de verdade no Google Maps, (2) tem um contato utilizável, (3) tem reputação mínima, (4) mostra interesse em se posicionar digitalmente e (5) tem uma lacuna clara de site que a LACUS pode resolver. Na dúvida, descarte. É melhor enviar 5 leads confiáveis do que 20 duvidosos.

FERRAMENTAS
- Conector "Lacus CRM Prospecção": api_usage_today, queue_claim_next, crm_upsert_leads, api_usage_log, queue_complete. É o ÚNICO lugar onde você lê e grava dados de leads. Não use planilhas.
- Google Maps: Places API (New), chamada pelo script Python do PASSO 3 (o domínio places.googleapis.com está liberado). Não use outra forma de acessar o Maps.
- WebSearch e WebFetch para conferir site e redes sociais.

PASSO 0. CONFERIR O AMBIENTE
Rode TZ=America/Sao_Paulo date +%F e date -u +%Y-%m-%dT%H (esta última é o runId BASE, ex.: 2026-11-23T14). Confirme que python3 está disponível e que você consegue salvar e rodar o script do PASSO 3. Se não conseguir, responda "sem acesso à Places API" e termine SEM chamar nenhuma ferramenta do CRM.

PASSO 1. SALDO DO DIA (antes de pegar qualquer item da fila)
Chame api_usage_today. Ele devolve {requestsToday, budget, remaining}.
- Se remaining for menor que 2: a cota do dia acabou. NÃO faça mais nada (não pegue item da fila, não chame a API) e termine com uma linha: "Cota diária atingida (requestsToday de budget). Próxima execução amanhã."
- Caso contrário: ORÇAMENTO desta execução = o menor entre 8 e remaining.

PASSO 2. PRÓXIMA COMBINAÇÃO DA FILA
Chame queue_claim_next com {runId: "<base>"}. Se o item vier nulo, responda "fila vazia" e termine. Guarde position, regionLabel, nicheName e os dados do nicho (termos de busca, ticket, notas). Daqui em diante o runId é "<base>-pos<position>" (ex.: 2026-11-23T14-pos12); use exatamente o mesmo em TODAS as chamadas seguintes. Se uma chamada falhar por rede ou timeout, repita com o mesmo runId: é seguro, nada duplica. (Só o queue_claim_next usa o runId base; se precisar repeti-lo, repita com o base.)
regionLabel tem o formato "PR - Curitiba - <Bairro>": a área-alvo é aquele bairro de Curitiba/PR.

PASSO 3. BUSCAR CANDIDATOS NA PLACES API (obrigatório)
Salve este script como maps_search.py no diretório de trabalho (copie exatamente):

import json, sys, urllib.request, urllib.error
KEY = "<CHAVE_PLACES_API>"
FIELDS = ",".join(["places.id","places.displayName","places.formattedAddress","places.nationalPhoneNumber",
  "places.rating","places.userRatingCount","places.websiteUri","places.googleMapsUri","places.businessStatus",
  "places.primaryTypeDisplayName","places.regularOpeningHours.weekdayDescriptions",
  "places.reviews.text","places.reviews.rating","places.reviews.relativePublishTimeDescription","nextPageToken"])
def search(q, token=None):
    body = {"textQuery": q, "languageCode": "pt-BR", "regionCode": "BR", "pageSize": 20}
    if token: body["pageToken"] = token
    req = urllib.request.Request("https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)
budget = int(sys.argv[1]); queries = sys.argv[2:]
out, calls, status = {}, 0, "OK"
pending = [(q, None) for q in queries]          # 1a pagina de todos os termos, depois a 2a
for rnd in range(2):
    nxt = []
    for q, token in pending:
        if calls >= budget or status != "OK": break
        try:
            d = search(q, token)
        except urllib.error.HTTPError as e:
            calls += 1
            status = "COTA_ESGOTADA" if e.code == 429 else f"ERRO_HTTP_{e.code}: {e.read()[:300]!r}"
            break
        calls += 1
        for p in d.get("places", []):
            out.setdefault(p["id"], p)
        if d.get("nextPageToken"): nxt.append((q, d["nextPageToken"]))
    pending = nxt
json.dump(list(out.values()), open("candidatos.json", "w"), ensure_ascii=False, indent=1)
print(f"STATUS={status} REQUISICOES={calls} CANDIDATOS={len(out)}")

Rode UMA única vez, passando o ORÇAMENTO do passo 1 como primeiro argumento e de 2 a 4 termos de busca (até 4 se o orçamento for 4 ou mais; senão, tantos termos quanto o orçamento), variando os termos do nicho (use os termos do nicho que vieram no item da fila, se houver) e sempre com a área-alvo. Ex. com orçamento 8 para "Clínicas odontológicas" no Xaxim:
python3 maps_search.py 8 "clínica odontológica Xaxim Curitiba PR" "dentista Xaxim Curitiba PR" "implante dentário Xaxim Curitiba PR" "ortodontia Xaxim Curitiba PR"
O script imprime STATUS, REQUISICOES e CANDIDATOS. Nunca rode o script uma segunda vez na mesma execução. Nunca mostre o conteúdo do script nem a chave no relatório.
Depois do script:
- STATUS começa com ERRO_HTTP, ou STATUS=COTA_ESGOTADA com CANDIDATOS=0: chame api_usage_log {runId, queuePosition: position, requests: REQUISICOES, leadsSaved: 0, note: "<STATUS resumido>"} e termine SEM chamar queue_complete (o item volta sozinho para a fila em 30 minutos). O relatório mostra a mensagem de erro.
- Caso contrário (OK, ou COTA_ESGOTADA com candidatos): siga com os candidatos obtidos.
Leia candidatos.json com Python (não cole o arquivo inteiro no contexto). Cada candidato tem: id (place_id), displayName.text, formattedAddress, nationalPhoneNumber, rating, userRatingCount, websiteUri, googleMapsUri, businessStatus, primaryTypeDisplayName.text, regularOpeningHours.weekdayDescriptions e reviews (texto, nota e há quanto tempo). Todo lead PRECISA vir daqui.

PASSO 4. FILTROS OBRIGATÓRIOS (com os dados da API; reprovou em um, descarte)
F0 businessStatus = "OPERATIONAL".
F1 Localização: formattedAddress contém "Curitiba" e o nome do bairro-alvo.
F2 Reputação: rating >= 4,0 E userRatingCount >= 10.
F3 Contato: tem nationalPhoneNumber.
F4 Nicho: a categoria e o nome batem com o nicho da fila (ex.: clínica de radiologia não é clínica odontológica).
F5 Porte: NÃO é franquia ou rede nacional/regional (ex.: OdontoCompany, OdontoTop, Orthodontic, Sorridents, Royal Face, I9Fit), nem hospital, órgão público, universidade, entidade de classe ou empresa grande. Um websiteUri que aponta para página de unidade de uma rede (ex.: /clinicas/... ou /pato-branco/) indica franquia. Profissionais que atendem no próprio nome (ex.: "Dra. Fulana | Dentista") SÃO válidos.
(O CRM descarta sozinho duplicados por Place ID, telefone ou nome; você não precisa checar duplicados.)
Ordene os aprovados por userRatingCount (maior primeiro) e siga com no máximo 30.

PASSO 5. CONFERIR PRESENÇA DIGITAL
a) Site:
   - websiteUri aponta para instagram.com, facebook.com, linktr.ee, wa.me, doctoralia ou similar: situação = "Só rede social" (guarde o link).
   - websiteUri aponta para site próprio: abra com WebFetch e classifique "Bom" (moderno, HTTPS, funciona no celular, mostra serviços e contato) ou "Ruim" (antigo, lento, sem HTTPS, quebrado, sem versão para celular, página única genérica, Google Sites ou construtor gratuito com aparência amadora, endereço de site temporário). Candidatos com site BOM são DESCARTADOS. Se o WebFetch falhar, tente WebSearch pelo domínio; se não conseguir avaliar, descarte.
   - Sem websiteUri: busque "<nome> <cidade>" com WebSearch. Se achar site próprio, classifique como acima; se achar só rede social, "Só rede social"; se nada, "Não tem".
b) Instagram e Facebook: busque "<nome> <cidade> instagram". Só registre um perfil claramente do negócio (nome e cidade batem). "Instagram atualizado" = true apenas se você viu publicação dos últimos 90 dias.
c) Sinais de interesse digital. Conte os CONFIRMADOS:
   S1 Instagram ou Facebook do negócio identificado
   S2 Publicação no Instagram nos últimos 90 dias
   S3 Horário preenchido no Maps (weekdayDescriptions não vazio)
   S4 30 avaliações ou mais
   S5 Nome do perfil no Maps com serviços ou palavras-chave (ex.: "Dentista em Pato Branco")
   S6 Site existente (mesmo ruim), Linktree ou agenda online
   S7 Anúncios ativos (Meta ou Google), se confirmado
   S8 Avaliação recente (alguma review com "semana" ou "mês" no tempo de publicação)
FILTRO F7 (interesse digital): PELO MENOS 2 sinais, sendo pelo menos um S1 ou S6.
FILTRO F8 (oportunidade): situação do site = "Não tem", "Só rede social" ou "Ruim".

PASSO 6. DADOS MÍNIMOS PARA ENVIAR UM LEAD
Só envie se TODOS estiverem preenchidos com dado confirmado: name, nicheName, regionLabel, phone, websiteStatus, mapsUrl, mapsRating, mapsReviews, placeId, address, mapsCategory, digitalSignals, businessSummary e pitch. Faltou algum? Descarte.
NUNCA invente dados. Opcionais não confirmados ficam de fora. Não entre em contato com ninguém. Colete somente dados comerciais publicados pelo negócio.
Meta: até 20 leads qualificados. Se menos passarem, envie só esses.

PASSO 7. ENVIAR OS LEADS AO CRM
Chame crm_upsert_leads com {runId, queuePosition: position, leads: [...]}, até 20 leads por chamada. Campos de cada lead:
- name: displayName, sem sufixos de palavra-chave depois de "|"
- nicheName: EXATAMENTE o nicheName do item da fila
- regionLabel: EXATAMENTE o regionLabel do item da fila
- placeId: id | phone: nationalPhoneNumber | address: formattedAddress
- mapsRating: rating (número) | mapsReviews: userRatingCount (inteiro) | mapsUrl: googleMapsUri | mapsCategory: primaryTypeDisplayName.text
- websiteUrl: URL do site próprio, se houver | websiteStatus: "none" (Não tem), "social_only" (Só rede social) ou "bad" (Ruim). Nunca "good".
- instagram: URL ou @ do perfil do negócio, se confirmado
- hasWhatsapp: true se o telefone for celular (9 dígitos começando com 9) ou se houver link de WhatsApp no site/Instagram; senão false
- hasActiveAds: true só se confirmado | instagramActive: true só com publicação dos últimos 90 dias
- digitalSignals: lista curta dos sinais confirmados, ex.: "Instagram ativo (post em out/2026); horário no Maps; 173 avaliações; avaliação recente". Se houver outras redes (Facebook, Linktree, Doctoralia), e-mail publicado ou reclamação concreta (review de nota 1 ou 2), acrescente aqui em poucas palavras
- businessSummary: 1 a 2 frases sobre serviços, especialidades e público, com base nas reviews, no Instagram e no site
- pitch: 1 frase com a lacuna concreta e um dado do próprio negócio (ex.: "Nota 4,9 com 173 avaliações, mas sem site próprio: quem busca 'implante dentário Xaxim' não encontra uma página com os serviços e o agendamento da clínica.")
A resposta traz created, updated e skipped (com o motivo). Confira que cada lead enviado aparece em um deles; leads "updated" com changed vazio já existiam e nada mudou. Se a chamada falhar, repita com o MESMO runId (não duplica).

PASSO 8. REGISTRAR O USO E CONCLUIR A FILA (obrigatório, por último)
1. api_usage_log com {runId, queuePosition: position, requests: <REQUISICOES do script>, leadsSaved: <total created>, note: "<Região> × <Nicho>; STATUS=<status>"}.
2. queue_complete com {position, runId, status: "done", leadsAdded: <total created>, notes: <funil>}. O funil é um texto curto, ex.: "API: 38 candidatos (6 req.); reprovados: 5 fora da área, 9 reputação, 1 sem telefone, 3 franquia; site bom: 8; sem interesse digital: 3; enviados: 7; criados: 5". Se nenhum lead passou, use status "done" com leadsAdded 0 e "sem resultados" no início das notas.
Se der erro ANTES de enviar os leads, registre o uso (passo 8.1) e termine sem concluir a fila. Se os leads já foram enviados, conclua a fila mesmo assim. Use status "error" só para falha definitiva e explique em notes.

Regras gerais: nunca invente dados; não repita o passo 2 com outro runId; se qualquer ferramenta responder erro de escopo (403) ou de autenticação (401), pare e informe.

RELATÓRIO FINAL
Curto: cidade/bairro e nicho, funil, requisições usadas nesta execução e saldo restante no dia, os 3 melhores leads com nota, avaliações e situação do site, e qualquer problema. Termine com uma linha:
"pos <position> <regionLabel> / <nicheName>: <created> criados, <skipped> ignorados, <requests> requisições"
```

Notas do fluxo:

- **Chave da Places API:** troque `<CHAVE_PLACES_API>` pela chave só no prompt da tarefa no claude.ai; ela não entra no repositório nem no CRM. No Google Cloud, restrinja a chave à API "Places API (New)".
- **Falha da Places (erro HTTP ou cota):** a tarefa registra o uso e **não conclui** o item; o lease de 30 minutos o devolve à fila sozinho. Só falha definitiva usa `status: "error"`, e nesse caso o item volta pela tela Fila (**Marcar como pendente**).
- **Duplicados:** a rotina não lê leads, então candidatos que já existem são analisados de novo e o CRM os descarta no upsert (`updated` com `changed` vazio, ou `skipped`). Não duplica; só gasta análise.
- **Campos que o CRM não recebe:** e-mail, outras redes, reclamações, porte e data do CNPJ da planilha antiga vão em texto dentro de `digitalSignals`.

- O `runId` base é a hora cheia UTC: duas execuções na mesma hora reaproveitam o mesmo item e não mudam nada (`queue_complete` só altera item pendente). Para repetir um teste, espere a próxima hora ou use outro `runId` base.
- O `runId` torna tudo idempotente: repetir `queue_claim_next` devolve o mesmo item; repetir `crm_upsert_leads` não duplica nem altera nada; `api_usage_log` é único por `runId`; `queue_complete` só muda item ainda pendente.
- Se a execução morrer no meio, o lease de 30 minutos solta o item; uma nova execução (outro `runId` base) pega o próximo pendente. Para refazer um item concluído com erro, use **Marcar como pendente** na tela Fila.
- Itens suprimidos ou marcados "Não contatar" voltam em `skipped` e nunca são recriados; campos escritos por você (status, notas, próxima ação etc.) nunca são sobrescritos.

## 3. O que só você pode testar (⏳)

1. Adicionar os dois conectores (passo 1) e ver o fluxo OAuth fechar: login Vercel, **Autorizar acesso**, conector ativo. Requer a URL pública HTTPS.
2. Rodar a tarefa uma vez manualmente e conferir na tela **Fila** o item `Concluído`, "Leads adicionados" e o painel de uso da API.
3. Rodar a mesma tarefa de novo com o mesmo `runId` (peça no prompt "use o runId 2026-11-20T14-pos12") e conferir que nada mudou.
