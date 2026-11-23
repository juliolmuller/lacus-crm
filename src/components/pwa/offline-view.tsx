'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { formatWhen } from '@/lib/format';
import { statusLabel } from '@/lib/leads/labels';
import { type OfflineSnapshot } from '@/lib/services/offline';

/**
 * "dd/mm hh:mm" em São Paulo.
 */
const stamp = (iso: string): string => {
  const w = formatWhen(new Date(iso));

  return `${w.slice(0, 5)} ${w.slice(-5)}`;
};

export function OfflineView(): React.JSX.Element {
  const [snap, setSnap] = useState<null | OfflineSnapshot | undefined>(undefined);

  useEffect(() => {
    const ctrl = new AbortController();

    // o service worker responde com o último snapshot guardado quando a rede falha
    fetch('/api/offline/snapshot', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<OfflineSnapshot>) : null))
      .then(setSnap, () => setSnap(null));

    return (): void => ctrl.abort();
  }, []);

  if (snap === undefined) return <p role="status">Carregando…</p>;

  if (snap === null)
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-page">Você está offline</h1>
        <p className="text-body text-text-muted">
          Ainda não há dados salvos neste aparelho. Abra o app com internet ao menos uma vez.
        </p>
      </section>
    );

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-page">Você está offline</h1>
        <p role="status" className="text-body text-text-muted">
          Você está offline: dados de {stamp(snap.generatedAt)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-section">Lembretes de hoje e atrasados</h2>
        {snap.reminders.length === 0 ? (
          <p className="text-body text-text-muted">Nenhum lembrete.</p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
            {snap.reminders.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 border-b border-border p-3 last:border-0"
              >
                <span className="text-body font-medium">{r.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-body text-text-muted">
                  {r.leadName} · {stamp(r.dueAt)}
                  {r.overdue && <Badge tone="danger">Atrasado</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-section">Leads para abordar</h2>
        <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
          {snap.leads.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 border-b border-border p-3 last:border-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-body font-medium">{l.name}</span>
                <span className="text-label text-text-muted">Score {l.score}</span>
              </span>
              <span className="text-body text-text-muted">
                {statusLabel[l.status]}
                {l.nextAction ? ` · ${l.nextAction}` : ''}
              </span>
              {l.phone && (
                <a
                  href={`tel:${l.phone}`}
                  className="text-body text-primary underline-offset-4 hover:underline"
                >
                  {l.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
