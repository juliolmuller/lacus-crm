import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { Alert } from '@/lib/services/dashboard';

/** Alertas de fila e orçamento. Google e sincronização já aparecem no banner do shell. */
export function DashboardAlerts({ alerts }: { alerts: Alert[] }) {
  const own = alerts.filter((a) => a.kind === 'queue_errors' || a.kind === 'over_budget');
  if (!own.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Alertas">
      {own.map((a) => (
        <li
          key={a.kind}
          role="alert"
          data-testid={`alert-${a.kind}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-danger/40 bg-danger/10 p-3 text-body"
        >
          <AlertTriangle className="size-4 shrink-0 text-danger-text" aria-hidden />
          <span className="min-w-0 flex-1">{a.message}</span>
          <Link href={a.href} className="text-primary underline-offset-4 hover:underline">
            Ver fila
          </Link>
        </li>
      ))}
    </ul>
  );
}
