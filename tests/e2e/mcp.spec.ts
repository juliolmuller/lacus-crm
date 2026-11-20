import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';

config({ path: '.env.local', quiet: true });

/** HTTP real contra o app: autenticação, escopos e conectores do MCP. Só leitura e tokens próprios. */
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
// limpa tokens de execuções anteriores (não os desta: há dois workers em paralelo)
test.beforeAll(() =>
  db.query(
    "delete from api_tokens where name like 'e2e-%' and created_at < now() - interval '10 minutes'",
  ),
);
test.afterAll(() => db.end());

async function pat(scopes: string[], revoked = false) {
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
const H = (token?: string) => ({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
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
  const names = async (path: string, token: string) => {
    const client = new Client({ name: 'e2e', version: '1.0.0' });
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
    await client.close();
    return tools.map((t) => t.name).sort();
  };
  const all = await names('/api/mcp', await pat(['read', 'write', 'prospecting']));
  expect(all).toHaveLength(20);
  expect(all).toContain('crm_update_lead');
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
  expect(Object.keys((await spec.json()).paths)).toContain('/queue/{position}/complete');
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
