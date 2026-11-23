import { BellOff } from 'lucide-react';
import { type Metadata } from 'next';
import Link from 'next/link';

import { ReminderItem } from '@/components/reminders/reminder-item';
import { rowToView } from '@/components/reminders/view';
import { EmptyState } from '@/components/ui/empty-state';
import { getDb } from '@/lib/db';
import { listReminders, type ReminderTab, whatsappLinks } from '@/lib/services/reminders';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Lembretes' };

const tabs: Array<{ empty: string; id: ReminderTab; label: string }> = [
  { id: 'overdue', label: 'Atrasados', empty: 'Nada atrasado. Bom trabalho!' },
  { id: 'today', label: 'Hoje', empty: 'Nenhum lembrete para o resto de hoje.' },
  { id: 'upcoming', label: 'Próximos', empty: 'Nada agendado para os próximos dias.' },
  { id: 'done', label: 'Concluídos', empty: 'Nenhum lembrete concluído ainda.' },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<React.JSX.Element> {
  const { tab: raw } = await searchParams;
  const tab = tabs.find((t) => t.id === raw)?.id ?? 'today';
  const db = getDb();
  const now = new Date();
  const { rows, counts } = await listReminders(db, tab, now);
  const links = await whatsappLinks(db, rows, now);
  const current = tabs.find((t) => t.id === tab)!;

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-page">Lembretes</h1>
      <nav
        aria-label="Filtro de lembretes"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      >
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/lembretes?tab=${t.id}`}
            aria-current={t.id === tab ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-body whitespace-nowrap',
              t.id === tab
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {t.label}
            {(t.id === 'overdue' || t.id === 'today') && counts[t.id] > 0 && (
              <span className="tabular ml-1.5 rounded-full bg-surface-3 px-1.5 text-label">
                {counts[t.id]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <ul className="flex flex-col gap-2" aria-label={current.label}>
          {rows.map((r) => (
            <ReminderItem key={r.id} r={rowToView(r, now, links.get(r.id) ?? null)} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={BellOff} title={current.empty}>
          Os lembretes nascem das regras de follow-up, ao registrar interações, e do botão “Novo
          lembrete” no lead ou na negociação.
        </EmptyState>
      )}
    </section>
  );
}
