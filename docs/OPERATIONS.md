# Operação

## PWA (instalar e usar offline)

O app é instalável e abre offline em `/~offline`, com o último snapshot (lembretes de hoje e atrasados, 50 leads de topo). O service worker só existe em build de produção (`next build`); em `next dev` ele fica desligado.

### Checagem rápida no desktop (Chrome)

1. Abra o site em produção, entre e navegue um pouco.
2. DevTools > Application > Manifest: sem erros de instalabilidade; Service Workers: `/serwist/sw.js` ativo e controlando a página; Cache Storage: `offline-snapshot` com `/api/offline/snapshot`.
3. Application > Service Workers > Offline (ou Network > Offline), recarregue: aparece "Você está offline: dados de dd/mm hh:mm" com a lista.
4. Saia (Sair): o cache `offline-snapshot` some.

### Android (Chrome), teste do Júlio

1. Abra o endereço de produção no Chrome e entre com a Vercel.
2. Menu Mais > "Instalar app" (ou menu do Chrome > Instalar app). Confirme.
3. Abra pelo ícone na tela inicial: deve abrir em tela cheia, sem barra do navegador. Pressione e segure o ícone: aparecem os atalhos "Novo lead", "Lembretes de hoje" e "Funil".
4. Modo avião, abra o app: deve aparecer `/~offline` com os dados. Desligue o modo avião e o app volta ao normal.
5. Faça login de novo dentro do app instalado: a tela da Vercel abre em tela cheia (sem popup).

### iOS (Safari), teste do Júlio

1. Abra o endereço no **Safari** e entre. Na primeira visita aparece o diálogo "Instale o Lacus CRM"; as mesmas instruções ficam em Mais.
2. Compartilhar > "Adicionar à Tela de Início" > Adicionar.
3. Abra pelo ícone: deve abrir em tela cheia (standalone). Repita o teste offline do passo 4 do Android.
4. Se o login não persistir depois de instalar, entre de novo dentro do app (o iOS guarda os cookies do app instalado separados do Safari).

### Atualizações

Depois de um deploy, o app instalado mostra o aviso "Nova versão disponível"; toque em "Atualizar" para trocar o worker e recarregar. Sem tocar, a versão nova entra quando todas as janelas do app forem fechadas.

### Testes automatizados

- `bun run e2e:pwa` faz o build e roda na porta 3101, contra produção, os testes de PWA (manifest, worker, offline, caches proibidos, logout, instalação) e o e2e do painel (desktop e celular).
- Lighthouse (mobile) contra o build local: `next start` com `E2E_AUTH_BYPASS=1 E2E_PROD_BUILD=1` (mais as variáveis de produção de mentira que estão em `playwright.pwa.config.ts`), pegue o cookie em `/api/e2e/login?next=/` e passe em `--extra-headers`.

## MCP e API REST

Endereço de produção: `https://lacuscrm.juliolmuller.com`. Toda chamada usa um token pessoal (PAT, `lcrm_...`) criado em **Configurações > Tokens de API e conectores**. O texto completo aparece uma única vez; no banco fica só o hash (SHA-256). Escopos: `read`, `write` (inclui `read`) e `prospecting` (fila e uso da API). Limite de 120 requisições por minuto por token. `crm_log_interaction` (e `POST /leads/:id/interactions`) recebe `summary` como título curto (recomendado até ~120 caracteres) e `body` opcional, com o detalhe, até 5000 caracteres; acima disso devolve `validation_error`. `crm_get_lead` devolve o `body` das interações.

### Claude Code

```bash
export LACUS_CRM_TOKEN=lcrm_...   # token com read + write (+ prospecting, se quiser a fila)
claude mcp add --transport http lacus-crm https://lacuscrm.juliolmuller.com/api/mcp --scope user \
  --header "Authorization: Bearer $LACUS_CRM_TOKEN"
claude mcp list
```

Para versionar a configuração num projeto, use um `.mcp.json` (o token fica no ambiente; não use nomes reservados como `ANTHROPIC_*`):

```json
{
  "mcpServers": {
    "lacus-crm": {
      "type": "http",
      "url": "https://lacuscrm.juliolmuller.com/api/mcp",
      "headers": { "Authorization": "Bearer ${LACUS_CRM_TOKEN}" }
    }
  }
}
```

`/api/mcp` expõe as 20 ferramentas da SPEC 9.1 mais `crm_save_diagnosis` (as que o escopo do token não cobre ficam fora da lista). `crm_save_diagnosis` grava os campos do diagnóstico, registra o texto como nota interna e move a negociação aberta de "A diagnosticar" para "A abordar" numa transação só; `crm_update_lead` aceita os mesmos campos, e `crm_search_leads` filtra por `hasPriority`/`hasSessionUrl` e ordena por `priority`. A skill de diagnóstico que usa essas ferramentas está em `docs/skills/diagnosticar-lead.md`. `/api/mcp/prospecting` expõe só `queue_claim_next`, `queue_complete`, `api_usage_today`, `api_usage_log`, `crm_upsert_leads`, `niches_list` e `regions_list`. Sem token ou com token revogado/expirado a resposta é 401 (com `WWW-Authenticate` apontando o resource metadata); com escopo insuficiente, 403.

Os campos `ticket` e `openness` do nicho (em `niches_list` e no `niche` de `queue_claim_next`, além do equivalente na REST) valem `high`, `medium` ou `low`. Antes da migration `0005` eram `alto|medio|baixo` e `alta|media|baixa`; rotinas e scripts que comparam esses valores precisam usar os novos.

### Erros das ferramentas

Uma ferramenta que falha responde com `isError` e o texto `código: mensagem`. Em `validation_error` o texto traz também as issues, e `structuredContent.error` repete `{code, message, details}`:

```text
validation_error: Entrada inválida
[{"path":"patch.priority","code":"invalid_value","message":"Invalid option: ..."}]
```

`crm_update_lead` com `patch` vazio não grava nada e devolve o lead atual.

### Erro `internal_error: Configuração inválida no banco: <chave>`

Um valor de `settings` guardado no banco não passa no schema atual da chave: quase sempre é uma migration pendente (por exemplo a `0005`, que renomeou `ticketPoints` de `alto/medio/baixo` para `high/medium/low`). Rode `bun run db:migrate` contra o Neon (passo a passo em `docs/DEPLOY.md`). Para conferir, `select value from settings where key = '<chave>';`.

### REST (`/api/v1`)

Referência gerada dos schemas: `GET https://lacuscrm.juliolmuller.com/api/v1/openapi.json`. Erros: `{"error": {"code", "message", "details?"}}`, com `details` no formato acima (`[{path, code, message}]`) em `validation_error`.

```bash
H="Authorization: Bearer $LACUS_CRM_TOKEN"; B=https://lacuscrm.juliolmuller.com/api/v1
curl -H "$H" "$B/leads?query=clinica&minScore=70&limit=10"
curl -H "$H" "$B/leads/<uuid>"
curl -H "$H" -X PATCH "$B/leads/<uuid>" -H 'content-type: application/json' \
  -d '{"next_action":"Ligar na segunda","priority":1}'
curl -H "$H" "$B/reminders?range=today"
curl -H "$H" -X POST "$B/leads/<uuid>/interactions" -H 'content-type: application/json' \
  -d '{"type":"whatsapp","direction":"outbound","summary":"Enviei a mensagem 1"}'
curl -H "$H" -X POST "$B/leads/<uuid>/interactions" -H 'content-type: application/json' \
  -d '{"type":"note","direction":"internal","summary":"Diagnóstico com Claude","body":"Sessão: https://claude.ai/…"}'
curl -H "$H" -X POST "$B/queue/claim" -H 'content-type: application/json' -d '{"runId":"2026-11-20T09-pos12"}'
curl -H "$H" "$B/api-usage/today"
curl -H "$H" -X POST https://lacuscrm.juliolmuller.com/api/jobs/followups -H 'X-Run-Id: manual-1'   # token com write
```

### Conectores OAuth (claude.ai)

O claude.ai usa OAuth (Client ID Metadata Document, sem registro dinâmico): o login é o da Vercel, a tela `/consent` pede os escopos e o acesso aparece em **Configurações > Conectores autorizados**, onde dá para revogar (o acesso já emitido expira em até 15 minutos). Passo a passo em `docs/ROTINA.md`.
