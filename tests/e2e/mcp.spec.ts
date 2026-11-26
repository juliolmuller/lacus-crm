import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { pointToE2eDatabase } from './env';

pointToE2eDatabase();

type McpTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

/**
 * HTTP real contra o app: autenticação, escopos e conectores do MCP. Cria
 * tokens próprios e, nos testes de escrita, altera leads fixture do `<db>_e2e`
 * (recriado a cada execução; cada projeto usa um lead diferente).
 */
// sem afterAll/end(): o mesmo worker roda o arquivo nos dois projetos; o pool ocioso fecha sozinho
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 1000,
  allowExitOnIdle: true,
});

// limpa tokens de execuções anteriores (não os desta: há dois workers em paralelo)
test.beforeAll(() =>
  db.query(
    "delete from api_tokens where name like 'e2e-%' and created_at < now() - interval '10 minutes'",
  ),
);

async function pat(scopes: string[], revoked = false): Promise<string> {
  const token = `lcrm_${randomBytes(32).toString('base64url')}`;

  await db.query(
    `insert into api_tokens (name, token_prefix, token_hash, scopes, revoked_at) values ($1,$2,$3,$4,$5)`,
    [
      `e2e-${Date.now()}`,
      token.slice(0, 8),
      createHash('sha256').update(token).digest('hex'),
      scopes,
      revoked ? new Date() : null,
    ],
  );

  return token;
}

const rpc = (name: string, args: object = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
});
const H = (
  token?: string,
): { 'accept': string; 'authorization'?: string | undefined; 'content-type': string } => ({
  'content-type': 'application/json',
  'accept': 'application/json, text/event-stream',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

test('sem token: 401 com WWW-Authenticate apontando o resource metadata', async ({ request }) => {
  for (const path of ['/api/mcp', '/api/mcp/prospecting']) {
    const r = await request.post(path, { headers: H(), data: rpc('crm_search_leads') });

    expect(r.status()).toBe(401);
    expect(r.headers()['www-authenticate']).toContain(
      `resource_metadata="http://localhost:3100/.well-known/oauth-protected-resource${path}"`,
    );
  }
});

test('token revogado: 401', async ({ request }) => {
  const r = await request.post('/api/mcp', {
    headers: H(await pat(['read'], true)),
    data: rpc('crm_search_leads'),
  });

  expect(r.status()).toBe(401);
});

test('token de prospecção não chama crm_update_lead: 403', async ({ request }) => {
  const r = await request.post('/api/mcp', {
    headers: H(await pat(['prospecting'])),
    data: rpc('crm_update_lead', { id: '00000000-0000-4000-8000-000000000000', patch: {} }),
  });

  expect(r.status()).toBe(403);
  expect(r.headers()['www-authenticate']).toContain('insufficient_scope');
});

test('REST: sem token 401, escopo errado 403, formato de erro', async ({ request }) => {
  const none = await request.get('/api/v1/leads');

  expect(none.status()).toBe(401);
  expect((await none.json()).error.code).toBe('unauthorized');

  const wrong = await request.get('/api/v1/leads', {
    headers: { authorization: `Bearer ${await pat(['prospecting'])}` },
  });

  expect(wrong.status()).toBe(403);
  expect((await wrong.json()).error.code).toBe('forbidden');
});

test('SDK oficial lista as ferramentas: completo e só prospecção', async () => {
  const listTools = async (path: string, token: string): Promise<McpTool[]> => {
    const client = new Client({ name: 'e2e', version: '1.0.0' });

    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://localhost:3100${path}`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );

      const { tools } = await client.listTools();

      if (path === '/api/mcp/prospecting') {
        const r = await client.callTool({ name: 'api_usage_today', arguments: {} });

        expect(r.structuredContent).toMatchObject({ remaining: expect.any(Number) });
      }

      return tools;
    } finally {
      await client.close();
    }
  };
  const names = async (path: string, token: string): Promise<string[]> =>
    (await listTools(path, token)).map((t) => t.name).sort();
  const all = await names('/api/mcp', await pat(['read', 'write', 'prospecting']));

  expect(all).toHaveLength(21);
  expect(all).toContain('crm_update_lead');

  const logTool = (await listTools('/api/mcp', await pat(['read', 'write']))).find(
    (t) => t.name === 'crm_log_interaction',
  );

  expect(Object.keys(logTool?.inputSchema.properties ?? {})).toContain('body');

  const sub = await names('/api/mcp/prospecting', await pat(['prospecting']));

  expect(sub).toEqual(
    [
      'api_usage_log',
      'api_usage_today',
      'crm_upsert_leads',
      'niches_list',
      'queue_claim_next',
      'queue_complete',
      'regions_list',
    ].sort(),
  );

  const readOnly = await names('/api/mcp', await pat(['read']));

  expect(readOnly).not.toContain('crm_update_lead');
});

test('crm_dashboard_summary pelo SDK oficial: {}, 7, 30, 90, "all" e "30"', async () => {
  const client = new Client({ name: 'e2e', version: '1.0.0' });

  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost:3100/api/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${await pat(['read'])}` } },
    }),
  );

  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === 'crm_dashboard_summary');
  const props = tool?.inputSchema.properties as Record<string, { default?: unknown }> | undefined;

  expect(props?.period?.default).toBe(30);

  const calls = [
    {},
    { period: 7 },
    { period: 30 },
    { period: 90 },
    { period: 'all' },
    { period: '30' },
  ];

  for (const args of calls) {
    const r = await client.callTool({ name: 'crm_dashboard_summary', arguments: args });

    expect(r.isError, JSON.stringify(args)).toBeFalsy();
    expect(r.structuredContent).toHaveProperty('kpis');
  }

  await client.close();
});

test('metadados OAuth: recurso protegido e servidor de autorização (CIMD, sem DCR)', async ({
  request,
}) => {
  for (const path of ['/api/mcp', '/api/mcp/prospecting']) {
    const prm = await (await request.get(`/.well-known/oauth-protected-resource${path}`)).json();

    expect(prm.resource).toBe(`http://localhost:3100${path}`);
    expect(prm.authorization_servers).toEqual(['http://localhost:3100/api/auth']);
  }
  const as = await (await request.get('/.well-known/oauth-authorization-server/api/auth')).json();

  expect(as.client_id_metadata_document_supported).toBe(true);
  expect(as.token_endpoint_auth_methods_supported).toContain('none');
  expect(as.code_challenge_methods_supported).toEqual(['S256']);
  expect(as.registration_endpoint).toBeUndefined();
});

test('REST com PAT: lista leads, openapi público e job de follow-ups com escopo write', async ({
  request,
}) => {
  const full = { authorization: `Bearer ${await pat(['read', 'write', 'prospecting'])}` };
  const list = await request.get('/api/v1/leads?limit=2', { headers: full });

  expect(list.status()).toBe(200);
  expect((await list.json()).items.length).toBeLessThanOrEqual(2);

  const today = await request.get('/api/v1/api-usage/today', { headers: full });

  expect(await today.json()).toMatchObject({ requestsToday: expect.any(Number) });

  const bad = await request.get('/api/v1/reminders?range=nope', { headers: full });

  expect(bad.status()).toBe(422);

  const spec = await request.get('/api/v1/openapi.json');

  expect(spec.status()).toBe(200);

  const doc = await spec.json();

  expect(Object.keys(doc.paths)).toContain('/queue/{position}/complete');

  const bodySchema =
    doc.paths['/leads/{id}/interactions'].post.requestBody.content['application/json'].schema
      .properties.body;

  // nullable vira anyOf: [string com maxLength, null]
  expect(JSON.stringify(bodySchema)).toContain('"maxLength":5000');

  const tooLong = await request.post(`/api/v1/leads/${randomUUID()}/interactions`, {
    headers: full,
    data: { type: 'note', direction: 'internal', summary: 'x', body: 'x'.repeat(5001) },
  });

  expect(tooLong.status()).toBe(422);
  expect((await tooLong.json()).error.code).toBe('validation_error');

  const noScope = await request.post('/api/jobs/followups', {
    headers: { authorization: `Bearer ${await pat(['read'])}` },
  });

  expect(noScope.status()).toBe(401);

  const job = await request.post('/api/jobs/followups', {
    headers: { ...full, 'x-run-id': `e2e-${Date.now()}` },
  });

  expect(job.status()).toBe(200);
});

test('bearer que não é PAT segue para o OAuth: JWT inválido dá 401', async ({ request }) => {
  const r = await request.post('/api/mcp', { headers: H('a.b.c'), data: rpc('crm_search_leads') });

  expect(r.status()).toBe(401);
  expect(r.headers()['www-authenticate']).toContain('resource_metadata=');
});

interface ToolReply {
  result: {
    content: Array<{ text: string }>;
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
}

test.describe('escrita via MCP: crm_update_lead e crm_save_diagnosis', () => {
  const callTool = async (
    request: APIRequestContext,
    token: string,
    name: string,
    args: object,
  ): Promise<ToolReply> => {
    const r = await request.post('/api/mcp', { headers: H(token), data: rpc(name, args) });

    const body = await r.text();
    // a resposta vem como SSE (`event: message\ndata: {...}`) ou JSON puro
    const data = body.split('\n').find((l) => l.startsWith('data:'));

    return JSON.parse(data ? data.slice(5) : body);
  };
  // um lead por projeto: os dois projetos rodam este arquivo em paralelo
  const leadId = async (projectName: string): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      'select id from leads order by name_normalized, id limit 4',
    );

    return rows[projectName === 'mobile' ? 1 : 0]!.id;
  };

  test('um campo grava, patch vazio é no-op e diagnóstico grava campos e nota', async ({
    request,
  }, info) => {
    const token = await pat(['read', 'write']);
    const id = await leadId(info.project.name);
    const channel = `WhatsApp ${Date.now()}`;
    const upd = await callTool(request, token, 'crm_update_lead', { id, patch: { channel } });

    expect(upd.result.isError).toBeFalsy();
    expect(upd.result.structuredContent?.channel).toBe(channel);

    const { rows } = await db.query<{ channel: string }>('select channel from leads where id=$1', [
      id,
    ]);

    expect(rows[0]?.channel).toBe(channel);

    const empty = await callTool(request, token, 'crm_update_lead', { id, patch: {} });

    expect(empty.result.isError).toBeFalsy();
    expect(empty.result.structuredContent?.id).toBe(id);
    expect(empty.result.structuredContent?.channel).toBe(channel);

    const diag = await callTool(request, token, 'crm_save_diagnosis', {
      id,
      patch: { website_status: 'good', session_url: 'https://claude.ai/x' },
      diagnosis: `Diagnóstico e2e ${channel}`,
    });

    expect(diag.result.isError).toBeFalsy();
    expect(diag.result.structuredContent?.interactionId).not.toBeNull();
  });

  test('patch inválido é erro e o caminho do campo aparece', async ({ request }, info) => {
    const token = await pat(['read', 'write']);
    const id = await leadId(info.project.name);

    for (const [patch, field] of [
      [{ nope: 1 }, 'nope'],
      [{ priority: 'x' }, 'priority'],
    ] as const) {
      const r = await callTool(request, token, 'crm_update_lead', { id, patch });

      // o SDK pode recusar antes do nosso handler; nos dois casos o campo recusado aparece
      expect(r.result.isError).toBe(true);
      expect(JSON.stringify(r)).toContain(field);
    }
  });

  test('patch enviado como string JSON é recusado', async ({ request }, info) => {
    const token = await pat(['read', 'write']);
    const id = await leadId(info.project.name);
    const r = await callTool(request, token, 'crm_update_lead', {
      id,
      patch: '{"channel":"WhatsApp"}',
    });

    expect(r.result.isError).toBe(true);
    info.annotations.push({ type: 'patch-string', description: JSON.stringify(r.result.content) });
  });
});
