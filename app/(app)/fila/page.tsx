import type { Metadata } from 'next';
import { QueueTable, type QueueRow } from '@/components/queue/queue-table';
import { UsagePanel } from '@/components/queue/usage-panel';
import { getDb } from '@/lib/db';
import { recentUsage, usageToday } from '@/lib/services/api-usage';
import { LEASE_MS, listQueue } from '@/lib/services/queue';

export const metadata: Metadata = { title: 'Fila' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = getDb();
  const now = new Date().getTime();
  const [items, today, usage] = await Promise.all([listQueue(db), usageToday(db), recentUsage(db)]);
  const rows: QueueRow[] = items.map((i) => ({
    position: i.position,
    region: i.regionLabel,
    niche: i.nicheName,
    status: i.status,
    skipped: i.skippedAt !== null,
    executedAt: i.executedAt?.toISOString() ?? null,
    leadsAdded: i.leadsAdded ?? 0,
    notes: i.notes,
    lease:
      i.status === 'pending' && i.claimedAt
        ? i.claimedAt.getTime() + LEASE_MS > now
          ? 'active'
          : 'expired'
        : null,
    leaseUntil: i.claimedAt ? new Date(i.claimedAt.getTime() + LEASE_MS).toISOString() : null,
  }));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-page">Fila</h1>
      <p className="text-body text-text-muted">
        Ordem em que a rotina prospecta região e nicho. Arraste para reordenar; a rotina sempre pega
        o primeiro pendente que não foi pulado.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <QueueTable rows={rows} />
        <UsagePanel
          today={today}
          days={usage.map((u) => ({
            day: u.day,
            at: u.at,
            requests: u.requests,
            leadsSaved: u.leadsSaved,
          }))}
        />
      </div>
    </section>
  );
}
