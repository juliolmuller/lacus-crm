import { mcpResources, SCOPES } from '@/lib/auth/mcp-resources';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

// RFC 9728 do segundo conector: o plugin mcp() só publica o documento do recurso principal.
export const GET = (): Response => {
  const base = getEnv().BETTER_AUTH_URL;

  return Response.json(
    {
      resource: mcpResources(base).prospecting,
      authorization_servers: [`${base}/api/auth`],
      bearer_methods_supported: ['header'],
      scopes_supported: SCOPES,
    },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } },
  );
};
