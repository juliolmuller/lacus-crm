import { z } from 'zod';
import { getDb } from '@/lib/db';
import { syncContext } from '@/lib/google/context';
import { runFollowupsJob } from '@/lib/services/jobs';
import {
  allows,
  looksLikePat,
  verifyToken,
  withinRateLimit,
  type VerifiedToken,
} from '@/lib/services/tokens';
import type { Scope } from '@/lib/auth/mcp-resources';
import { ApiError, toApiError } from './errors';
import {
  apiUsageLog,
  apiUsageToday,
  getLeadFull,
  listRemindersOp,
  logInteractionOp,
  queueClaimNext,
  queueComplete,
  searchLeads,
  updateLeadOp,
  upsertLeadsOp,
  type Op,
} from './ops';

type Req = { params: Record<string, string>; query: URLSearchParams; body: unknown; req: Request };
type Route = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string; // /leads/:id
  summary: string;
  scopes: Scope[];
  /** operação de negócio + como montar a entrada a partir da requisição */
  op?: Op;
  input?: (r: Req) => unknown;
  /** rota sem operação (job) */
  run?: (r: Req, t: VerifiedToken) => Promise<unknown>;
};

const num = (v: string | null) => (v == null || v === '' ? undefined : Number(v));
const obj = (b: unknown) => (b && typeof b === 'object' ? (b as object) : {});

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/leads',
    summary: 'Busca leads (até 50 por página, com cursor)',
    scopes: ['read'],
    op: searchLeads,
    input: ({ query: q }) => ({
      query: q.get('query') ?? q.get('q') ?? undefined,
      status: q.get('status')?.split(',').filter(Boolean),
      nicheId: num(q.get('nicheId')),
      regionLabel: q.get('regionLabel') ?? undefined,
      minScore: num(q.get('minScore')),
      hasOpenDeal: q.has('hasOpenDeal') ? q.get('hasOpenDeal') === 'true' : undefined,
      limit: num(q.get('limit')),
      cursor: q.get('cursor') ?? undefined,
    }),
  },
  {
    method: 'POST',
    path: '/leads/upsert',
    summary: 'Cria ou atualiza leads da prospecção (idempotente por runId)',
    scopes: ['write', 'prospecting'],
    op: upsertLeadsOp,
    input: ({ body }) => body,
  },
  {
    method: 'GET',
    path: '/leads/:id',
    summary: 'Lead completo com negociação, interações e lembretes',
    scopes: ['read'],
    op: getLeadFull,
    input: ({ params }) => ({ id: params.id }),
  },
  {
    method: 'PATCH',
    path: '/leads/:id',
    summary: 'Atualiza campos permitidos do lead',
    scopes: ['write'],
    op: updateLeadOp,
    input: ({ params, body }) => ({ id: params.id, patch: body }),
  },
  {
    method: 'POST',
    path: '/leads/:id/interactions',
    summary: 'Registra uma interação',
    scopes: ['write'],
    op: logInteractionOp,
    input: ({ params, body }) => ({ ...obj(body), leadId: params.id }),
  },
  {
    method: 'POST',
    path: '/queue/claim',
    summary: 'Pega o próximo item da fila (lease de 30 min)',
    scopes: ['prospecting'],
    op: queueClaimNext,
    input: ({ body }) => body,
  },
  {
    method: 'POST',
    path: '/queue/:position/complete',
    summary: 'Conclui o item da fila (idempotente)',
    scopes: ['prospecting'],
    op: queueComplete,
    input: ({ params, body }) => ({ ...obj(body), position: Number(params.position) }),
  },
  {
    method: 'GET',
    path: '/api-usage/today',
    summary: 'Uso da API de Places hoje',
    scopes: ['prospecting'],
    op: apiUsageToday,
    input: () => ({}),
  },
  {
    method: 'POST',
    path: '/api-usage',
    summary: 'Registra o uso da API (único por runId)',
    scopes: ['prospecting'],
    op: apiUsageLog,
    input: ({ body }) => body,
  },
  {
    method: 'GET',
    path: '/reminders',
    summary: 'Lembretes abertos: range=overdue|today|next7',
    scopes: ['read'],
    op: listRemindersOp,
    input: ({ query: q }) => ({
      range: q.get('range') ?? undefined,
      limit: num(q.get('limit')),
      cursor: q.get('cursor') ?? undefined,
    }),
  },
  {
    method: 'POST',
    path: '/jobs/followups',
    summary: 'Dispara o job de follow-ups (cabeçalho X-Run-Id torna a chamada idempotente)',
    scopes: ['write'],
    run: ({ req }) =>
      runFollowupsJob(getDb(), syncContext(), { executionId: req.headers.get('x-run-id') }),
  },
];

const compile = (path: string) => new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
const compiled = routes.map((r) => ({ r, re: compile(r.path) }));

/** Autentica um PAT (REST só aceita PAT; o OAuth é do MCP). */
export async function authenticate(req: Request, need: Scope[]) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!bearer || !looksLikePat(bearer))
    throw new ApiError('unauthorized', 'Token ausente ou inválido');
  const v = await verifyToken(getDb(), bearer);
  if (!v.ok) throw new ApiError('unauthorized', 'Token inválido, revogado ou expirado');
  if (!withinRateLimit(v.token.id))
    throw new ApiError('rate_limited', 'Limite de 120 requisições por minuto');
  if (!allows(v.token.scopes, need))
    throw new ApiError('forbidden', `Escopo necessário: ${need.join(' ou ')}`);
  return v.token;
}

export async function handleRest(req: Request, path: string): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  try {
    const url = new URL(req.url);
    let hit: { r: Route; params: Record<string, string> } | undefined;
    let pathMatched = false;
    for (const { r, re } of compiled) {
      const m = re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method === req.method) hit = { r, params: m.groups ?? {} };
    }
    if (!hit) {
      if (pathMatched) throw new ApiError('validation_error', 'Método não permitido');
      throw new ApiError('not_found', 'Rota não encontrada');
    }
    const token = await authenticate(req, hit.r.scopes);
    const body = req.method === 'GET' ? undefined : await req.json().catch(() => ({}));
    const r: Req = { params: hit.params, query: url.searchParams, body, req };
    let data: unknown;
    if (hit.r.op) {
      const args = hit.r.op.input.parse(hit.r.input!(r));
      data = await hit.r.op.run(args as never, { db: getDb(), actor: `mcp:${token.id}` });
    } else data = await hit.r.run!(r, token);
    return Response.json(data, { headers });
  } catch (e) {
    const err = toApiError(e);
    return Response.json(err.body(), { status: err.status, headers });
  }
}

/** OpenAPI 3.1 gerado dos schemas Zod das operações (Zod v4 `z.toJSONSchema`). */
export function openApi(baseUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const p = r.path.replace(/:(\w+)/g, '{$1}');
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: m[1] === 'position' ? 'integer' : 'string' },
    }));
    const schema = r.op
      ? z.toJSONSchema(r.op.input, { io: 'input' })
      : null;
    const isQuery = r.method === 'GET';
    (paths[p] ??= {})[r.method.toLowerCase()] = {
      summary: r.summary,
      description: r.op?.description,
      security: [{ bearer: r.scopes }],
      parameters: [
        ...params,
        ...(isQuery && schema && 'properties' in schema
          ? Object.entries(schema.properties as Record<string, unknown>).map(([name, s]) => ({
              name,
              in: 'query',
              schema: s,
            }))
          : []),
      ],
      ...(!isQuery && schema
        ? { requestBody: { content: { 'application/json': { schema } } } }
        : {}),
      responses: {
        '200': { description: 'OK' },
        '401': { $ref: '#/components/responses/Error' },
        '403': { $ref: '#/components/responses/Error' },
        '422': { $ref: '#/components/responses/Error' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Lacus CRM API', version: '1.0.0' },
    servers: [{ url: `${baseUrl}/api/v1` }],
    paths,
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'Token pessoal lcrm_...' },
      },
      responses: {
        Error: {
          description: 'Erro',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      message: { type: 'string' },
                      details: {},
                    },
                    required: ['code', 'message'],
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
