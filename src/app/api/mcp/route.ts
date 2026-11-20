import { mcpPost } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Só POST (stateless): GET e DELETE respondem 405.
export const POST = mcpPost('full');
