import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { listReminders } from './reminders';

const { leads } = schema;

/** Dados mínimos para o modo offline (SPEC 8): lembretes de hoje e atrasados + 50 leads de topo. */
export async function offlineSnapshot(db: Db, now = new Date()) {
  const [overdue, today, top] = await Promise.all([
    listReminders(db, 'overdue', now),
    listReminders(db, 'today', now),
    db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        nextAction: leads.nextAction,
        status: leads.contactStatus,
        score: leads.score,
      })
      .from(leads)
      .where(eq(leads.doNotContact, false))
      .orderBy(sql`${leads.priority} asc nulls last`, desc(leads.score), asc(leads.name))
      .limit(50),
  ]);
  return {
    generatedAt: now.toISOString(),
    reminders: [...overdue.rows, ...today.rows].map((r) => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt.toISOString(),
      overdue: r.dueAt < now,
      leadName: r.leadName,
    })),
    leads: top,
  };
}
export type OfflineSnapshot = Awaited<ReturnType<typeof offlineSnapshot>>;
