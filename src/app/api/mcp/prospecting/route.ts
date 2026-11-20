import { mcpPost } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Conector da rotina: só as ferramentas de prospecção (menor privilégio, PLAN D1).
export const POST = mcpPost('prospecting');
