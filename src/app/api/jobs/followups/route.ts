import { timingSafeEqual } from 'node:crypto';

import { authenticate } from '@/lib/api/rest';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { syncContext } from '@/lib/google/context';
import { runFollowupsJob } from '@/lib/services/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * CRON_SECRET (Vercel) ou um PAT com escopo `write` (disparo externo).
 */
async function authorized(req: Request): Promise<boolean> {
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${getEnv().CRON_SECRET}`;

  if (got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return true;

  return authenticate(req, ['write']).then(
    () => true,
    () => false,
  );
}

/**
 * Job de follow-ups (SPEC 11). Vercel Schedules chama por POST; o cron diário
 * de reserva usa GET. Idempotente por `ce-id` (Schedules) ou `X-Run-Id`; sem
 * id, cada chamada roda (o job é seguro).
 */
async function handle(req: Request): Promise<Response> {
  if (!(await authorized(req))) return new Response('Não autorizado', { status: 401 });

  const executionId = req.headers.get('ce-id') ?? req.headers.get('x-run-id');
  const result = await runFollowupsJob(getDb(), syncContext(), { executionId });

  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}

export { handle as GET, handle as POST };
