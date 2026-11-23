import { handleRest, openApi } from '@/lib/api/rest';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Ctx {
  params: Promise<{ path: string[] }>;
}

async function handler(req: Request, { params }: Ctx): Promise<Response> {
  const path = `/${(await params).path.join('/')}`;

  if (req.method === 'GET' && path === '/openapi.json')
    return Response.json(openApi(getEnv().BETTER_AUTH_URL));

  return handleRest(req, path);
}

export { handler as GET, handler as PATCH, handler as POST };
