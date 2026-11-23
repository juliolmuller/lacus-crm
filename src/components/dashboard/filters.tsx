'use client';

import { useQueryStates } from 'nuqs';
import { useTransition } from 'react';

import { SelectField } from '@/components/ui/field';
import { dashboardSearchParams, periodLabel, PERIODS } from '@/lib/dashboard/filters';
import { cn } from '@/lib/utils';

/**
 * Período, nicho e região na URL (nuqs): trocar um refaz as agregações no
 * servidor.
 */
export function DashboardFilters({
  niches,
  regions,
}: {
  niches: Array<{ id: number; name: string }>;
  regions: Array<{ id: number; label: string }>;
}): React.JSX.Element {
  const [pending, start] = useTransition();
  const [f, set] = useQueryStates(dashboardSearchParams, {
    shallow: false,
    startTransition: start,
  });

  return (
    <div
      className="flex flex-wrap items-end gap-x-4 gap-y-3"
      aria-busy={pending}
      data-testid="dashboard-filters"
    >
      <div
        role="group"
        aria-label="Período"
        className="flex rounded-md border border-border-strong"
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={f.period === p}
            onClick={() => set({ period: p })}
            className={cn(
              'min-h-9 px-3 text-body first:rounded-l-md last:rounded-r-md',
              f.period === p ? 'bg-primary text-primary-fg' : 'text-text-muted hover:bg-surface-3',
            )}
          >
            {periodLabel[p]}
          </button>
        ))}
      </div>
      <SelectField
        label="Nicho"
        className="w-full sm:w-48"
        value={f.niche ?? ''}
        onChange={(e) => set({ niche: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Todos</option>
        {niches.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Região"
        className="w-full sm:w-56"
        value={f.region ?? ''}
        onChange={(e) => set({ region: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Todas</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </SelectField>
      <p role="status" className="text-label text-text-muted">
        {pending ? 'Atualizando…' : ''}
      </p>
    </div>
  );
}
