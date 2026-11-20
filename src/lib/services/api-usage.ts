import { desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { spYmd } from '@/lib/followups/business-days';
import { getSetting } from './followup-settings';

const { apiUsageLog } = schema;

/** `{requestsToday, budget, remaining}` (dia de São Paulo; SPEC 9.1). */
export async function usageToday(db: Db, now = new Date()) {
  const [[row], budget] = await Promise.all([
    db
      .select({ n: sql<number>`coalesce(sum(${apiUsageLog.requests}), 0)` })
      .from(apiUsageLog)
      .where(eq(apiUsageLog.day, spYmd(now))),
    getSetting(db, 'places_daily_budget'),
  ]);
  const requestsToday = Number(row?.n ?? 0);
  return { requestsToday, budget, remaining: Math.max(0, budget - requestsToday) };
}

export type UsageInput = {
  runId: string;
  queuePosition?: number | null;
  requests: number;
  leadsSaved: number;
  note?: string | null;
};

/** Um registro por `runId`: repetir a chamada devolve o mesmo registro sem somar de novo. */
export async function logUsage(db: Db, input: UsageInput, now = new Date()) {
  const at = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hourCycle: 'h23',
    timeStyle: 'medium',
  }).format(now);
  await db
    .insert(apiUsageLog)
    .values({
      day: spYmd(now),
      at,
      queuePosition: input.queuePosition ?? null,
      requests: input.requests,
      leadsSaved: input.leadsSaved,
      note: input.note ?? null,
      runId: input.runId,
    })
    .onConflictDoNothing({ target: apiUsageLog.runId });
  const [row] = await db.select().from(apiUsageLog).where(eq(apiUsageLog.runId, input.runId));
  return row!;
}

/** Últimos 30 dias, mais recentes primeiro (painel da Fila). */
export const recentUsage = (db: Db, now = new Date()) =>
  db
    .select()
    .from(apiUsageLog)
    .where(gte(apiUsageLog.day, spYmd(new Date(now.getTime() - 29 * 86_400_000))))
    .orderBy(desc(apiUsageLog.day), desc(apiUsageLog.at), desc(apiUsageLog.id));
