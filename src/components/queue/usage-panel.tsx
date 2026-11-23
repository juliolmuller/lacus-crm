import { cn } from '@/lib/utils';

interface Day {
  at: string;
  day: string;
  leadsSaved: number;
  requests: number;
}

const dm = (ymd: string): string => `${ymd.slice(8)}/${ymd.slice(5, 7)}`;

/**
 * Uso da API hoje × orçamento e os registros dos últimos 30 dias (somados por
 * dia).
 */
export function UsagePanel({
  today,
  days,
}: {
  days: Day[];
  today: { budget: number; remaining: number; requestsToday: number };
}): React.JSX.Element {
  const over = today.requestsToday > today.budget;
  const byDay = new Map<string, { leads: number; requests: number }>();
  for (const d of days) {
    const c = byDay.get(d.day) ?? { requests: 0, leads: 0 };

    byDay.set(d.day, { requests: c.requests + d.requests, leads: c.leads + d.leadsSaved });
  }

  return (
    <aside
      aria-label="Uso da API"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-4"
    >
      <h2 className="text-section">Uso da API</h2>
      <p className="tabular text-body">
        <span className={cn('text-section', over && 'text-danger-text')}>
          {today.requestsToday}
        </span>{' '}
        / {today.budget} requisições hoje · restam {today.remaining}
      </p>
      <div
        role="progressbar"
        aria-label="Requisições de hoje"
        aria-valuemin={0}
        aria-valuemax={today.budget}
        aria-valuenow={Math.min(today.requestsToday, today.budget)}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-primary')}
          style={{
            width: `${Math.min(100, (today.requestsToday / Math.max(1, today.budget)) * 100)}%`,
          }}
        />
      </div>
      <table className="w-full text-left text-label">
        <caption className="mb-1 text-left text-text-muted">Últimos 30 dias</caption>
        <thead className="text-text-muted">
          <tr>
            <th className="py-1">Dia</th>
            <th className="py-1 text-right">Requisições</th>
            <th className="py-1 text-right">Leads</th>
          </tr>
        </thead>
        <tbody>
          {[...byDay].map(([day, v]) => (
            <tr key={day} className="border-t border-border tabular">
              <td className="py-1">{dm(day)}</td>
              <td className="py-1 text-right">{v.requests}</td>
              <td className="py-1 text-right">{v.leads}</td>
            </tr>
          ))}
          {!byDay.size && (
            <tr>
              <td colSpan={3} className="py-2 text-text-muted">
                Sem registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </aside>
  );
}
