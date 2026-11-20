import { getAuth } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

// RFC 9728 (`/api/mcp` e `/api/mcp/prospecting`): quem monta o documento é o plugin mcp(), via onRequest.
export const GET = (req: Request) => getAuth().handler(req);
