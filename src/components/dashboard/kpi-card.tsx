import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Card de KPI: rótulo, número grande com tabular-nums e uma linha de contexto
 * (nunca só cor).
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  hint?: ReactNode;
  label: string;
  tone?: 'danger' | 'neutral';
  value: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface-1 p-4 shadow-e1',
        tone === 'danger' ? 'border-danger/50' : 'border-border',
      )}
    >
      <p className="text-label text-text-muted">{label}</p>
      <p className="tabular text-kpi break-words">{value}</p>
      {hint ? <p className="text-label text-text-muted">{hint}</p> : null}
    </div>
  );
}
