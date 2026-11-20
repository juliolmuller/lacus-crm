import { requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { toApiError } from '@/lib/api/errors';
import { ALL_OPS, type Op } from '@/lib/api/ops';
import { getAuth } from '@/lib/auth/auth';
import { mcpResources } from '@/lib/auth/mcp-resources';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { allows, looksLikePat, verifyToken, withinRateLimit } from '@/lib/services/tokens';

export type Kind = 'full' | 'prospecting';

type Principal = { actor: string; scopes: string[] };

const visible = (kind: Kind) =>
  ALL_OPS.filter(
    (o) => kind === 'full' || ('prospecting' in o && o.prospecting),
  ) as unknown as Op[];

const MAX_TEXT = 8000;
const summary = (r: unknown) => {
  const o = r as Record<string, unknown> | null;
  if (o && Array.isArray(o.items))
    return `${o.items.length} item(ns)${o.nextCursor ? ', há mais (nextCursor)' : ''}`;
  if (o && Array.isArray(o.created))
    return `criados ${o.created.length}, atualizados ${(o.updated as unknown[]).length}, ignorados ${(o.skipped as unknown[]).length}`;
  return 'ok';
};

/** Uma ferramenta = uma operação de negócio (`lib/api/ops.ts`); o MCP só valida, chama e formata. */
function buildServer(kind: Kind, p: Principal) {
  const server = new McpServer({ name: 'lacus-crm', version: '1.0.0' });
  for (const o of visible(kind)) {
    if (!allows(p.scopes, o.scopes)) continue;
    server.registerTool(
      o.name,
      { description: o.description, inputSchema: o.input as never },
      (async (args: unknown) => {
        try {
          const result = JSON.parse(
            JSON.stringify(await o.run(args as never, { db: getDb(), actor: p.actor })),
          );
          const text = `${summary(result)}\n${JSON.stringify(result)}`.slice(0, MAX_TEXT);
          return { content: [{ type: 'text', text }], structuredContent: result };
        } catch (e) {
          const err = toApiError(e);
          return {
            isError: true,
            content: [{ type: 'text', text: `${err.code}: ${err.message}` }],
          };
        }
      }) as never,
    );
  }
  return server;
}

const handlers = new Map<Kind, ReturnType<typeof createMcpHandler>>();
const handlerFor = (kind: Kind) => {
  let h = handlers.get(kind);
  if (!h) {
    // legacy padrão ('stateless'): atende também clientes 2025 (claude.ai, Claude Code) sem sessão
    h = createMcpHandler((ctx) =>
      buildServer(kind, {
        actor: String(ctx.authInfo?.extra?.actor ?? 'mcp:unknown'),
        scopes: ctx.authInfo?.scopes ?? [],
      }),
    );
    handlers.set(kind, h);
  }
  return h;
};

const resourceOf = (kind: Kind) => {
  const r = mcpResources(getEnv().BETTER_AUTH_URL);
  return kind === 'full' ? r.main : r.prospecting;
};
const metadataUrl = (kind: Kind) => {
  const u = new URL(resourceOf(kind));
  return `${u.origin}/.well-known/oauth-protected-resource${u.pathname}`;
};

const rpcError = (status: number, message: string, headers: HeadersInit = {}) =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32001, message }, id: null },
    { status, headers },
  );

/** 403 se o corpo chama uma ferramenta que o token não pode usar (SPEC 9: 401 sem token, 403 sem escopo). */
async function scopeGate(req: Request, kind: Kind, scopes: string[]) {
  const text = await req.text();
  let calls: { method?: string; params?: { name?: string } }[] = [];
  try {
    const j = JSON.parse(text);
    calls = Array.isArray(j) ? j : [j];
  } catch {
    // corpo inválido: o handler do MCP responde o erro de protocolo
  }
  for (const c of calls) {
    if (c.method !== 'tools/call') continue;
    const o = visible(kind).find((x) => x.name === c.params?.name);
    if (o && !allows(scopes, o.scopes))
      return {
        denied: rpcError(403, `Escopo insuficiente para ${o.name}`, {
          'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${o.scopes.join(' ')}", resource_metadata="${metadataUrl(kind)}"`,
        }),
      };
  }
  return { text };
}

async function serve(req: Request, kind: Kind, p: Principal) {
  const gate = await scopeGate(req, kind, p.scopes);
  if (gate.denied) return gate.denied;
  const authInfo: AuthInfo = {
    token: 'redacted',
    clientId: p.actor,
    scopes: p.scopes,
    extra: { actor: p.actor },
  };
  const next = new Request(req.url, { method: 'POST', headers: req.headers, body: gate.text });
  return handlerFor(kind).fetch(next, { authInfo, parsedBody: safeJson(gate.text) });
}
const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
};

/** PAT primeiro (hash no banco); qualquer outro bearer segue para a validação do token OAuth (JWT). */
export function mcpPost(kind: Kind) {
  let oauth: ((req: Request) => Promise<Response>) | undefined;
  return async function POST(req: Request) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (bearer && looksLikePat(bearer)) {
      const v = await verifyToken(getDb(), bearer);
      if (!v.ok)
        return rpcError(401, 'Token inválido, revogado ou expirado', {
          'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${metadataUrl(kind)}"`,
        });
      if (!withinRateLimit(v.token.id))
        return rpcError(429, 'Limite de 120 requisições por minuto', { 'Retry-After': '60' });
      return serve(req, kind, { actor: `mcp:${v.token.id}`, scopes: v.token.scopes });
    }
    oauth ??= requireMcpAuth(
      getAuth() as unknown as Parameters<typeof requireMcpAuth>[0], // tipo do `verification.modelName` do app
      (r, claims) =>
        serve(r, kind, {
          actor: `mcp:oauth:${String(claims.azp ?? claims.client_id ?? claims.sub)}`,
          scopes: String(claims.scope ?? '')
            .split(' ')
            .filter(Boolean),
        }),
      {
        resource: resourceOf(kind),
        challengeScopes: kind === 'full' ? ['read', 'write', 'prospecting'] : ['prospecting'],
      },
    );
    return oauth(req);
  };
}
