import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { type Prospecting } from '@/lib/services/dashboard';
import { cn } from '@/lib/utils';

import { Sparkline } from './charts';
import { Panel } from './panel';

const dm = (ymd: string): string => `${ymd.slice(8)}/${ymd.slice(5, 7)}`;

/**
 * Uso da API hoje × orçamento (estourou: vermelho, ícone e texto), 14 dias e a
 * fila.
 */
export function ProspectingCard({ p }: { p: Prospecting }): React.JSX.Element {
  const pct = Math.min(100, (p.requestsToday / p.budget) * 100);

  return (
    <Panel
      title="Prospecção"
      action={
        <Link href="/fila" className="text-body text-primary underline-offset-4 hover:underline">
          Abrir fila
        </Link>
      }
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="tabular text-body">
            <span className={cn('text-section', p.overBudget && 'text-danger-text')}>
              {p.requestsToday}
            </span>{' '}
            / {p.budget} requisições hoje
          </p>
          {p.overBudget && (
            <span className="flex items-center gap-1 text-label font-semibold text-danger-text">
              <AlertTriangle className="size-4" aria-hidden />
              Acima do orçamento
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Requisições de hoje"
          aria-valuemin={0}
          aria-valuemax={p.budget}
          aria-valuenow={Math.min(p.requestsToday, p.budget)}
          aria-valuetext={`${p.requestsToday} de ${p.budget}`}
          className="h-2 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn('h-full rounded-full', p.overBudget ? 'bg-danger' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="tabular text-label text-text-muted">
          {p.savedToday} {p.savedToday === 1 ? 'lead gravado' : 'leads gravados'} hoje
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Sparkline
          data={p.series.map((d) => ({ name: dm(d.day), requests: d.requests }))}
          budget={p.budget}
          label="Requisições por dia nos últimos 14 dias; a linha tracejada é o orçamento diário"
        />
        <p className="text-label text-text-muted">Últimos 14 dias (tracejado: orçamento diário)</p>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['Pendentes', p.queue.pending],
            ['Feitas', p.queue.done],
            ['Com erro', p.queue.error],
            ['Puladas', p.queue.skipped],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-md bg-surface-2 px-1 py-2">
            <dd
              className={cn(
                'tabular text-lead font-semibold',
                label === 'Com erro' && n > 0 && 'text-danger-text',
              )}
            >
              {n}
            </dd>
            <dt className="text-label text-text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-body">
        <span className="text-text-muted">Próximo da fila: </span>
        {p.next ? `${p.next.niche} em ${p.next.region}` : 'fila vazia'}
      </p>
    </Panel>
  );
}
