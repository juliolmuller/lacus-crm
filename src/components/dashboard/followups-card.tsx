import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { ReminderItem, type ReminderView } from '@/components/reminders/reminder-item';

import { Empty, Panel } from './panel';

interface Band {
  count: number;
  id: string;
  items: ReminderView[];
  tab: string;
  title: string;
}

/**
 * Atrasados (vermelho, com ícone), hoje e próximos 7 dias; Concluir e Adiar são
 * os do `/lembretes`.
 */
export function FollowupsCard({ bands }: { bands: Band[] }): React.JSX.Element {
  const total = bands.reduce((s, b) => s + b.count, 0);

  return (
    <Panel
      title="Follow-ups"
      action={
        <Link
          href="/lembretes"
          className="text-body text-primary underline-offset-4 hover:underline"
        >
          Ver todos
        </Link>
      }
    >
      {total === 0 ? (
        <Empty>Nenhum follow-up pendente para os próximos 7 dias.</Empty>
      ) : (
        bands.map((b) => (
          <div key={b.id} className="flex flex-col gap-2" data-testid={`followups-${b.id}`}>
            <h3
              className={
                b.id === 'overdue' && b.count > 0
                  ? 'flex items-center gap-1.5 text-label font-semibold text-danger-text'
                  : 'text-label font-semibold text-text-muted'
              }
            >
              {b.id === 'overdue' && b.count > 0 && (
                <AlertTriangle className="size-4" aria-hidden />
              )}
              {b.title} <span className="tabular">({b.count})</span>
            </h3>
            {b.items.length ? (
              <ul className="flex flex-col gap-2">
                {b.items.map((r) => (
                  <ReminderItem key={r.id} r={r} />
                ))}
              </ul>
            ) : (
              <Empty>Nada por aqui.</Empty>
            )}
            {b.count > b.items.length && (
              <Link
                href={`/lembretes?tab=${b.tab}`}
                className="text-label text-primary underline-offset-4 hover:underline"
              >
                Ver os {b.count} desta faixa
              </Link>
            )}
          </div>
        ))
      )}
    </Panel>
  );
}
