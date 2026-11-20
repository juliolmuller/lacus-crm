import { formatMoney, formatPercent } from '@/lib/format';
import type { Funnel } from '@/lib/services/dashboard';
import { HBarChart, type BarDatum } from './charts';
import { Empty, Panel } from './panel';

/** Barras por etapa (quantidade e R$) e a conversão entre etapas consecutivas. */
export function FunnelCard({ stages }: { stages: Funnel }) {
  const data: BarDatum[] = stages.map((s) => ({
    name: s.name,
    value: s.count,
    text: `${s.count} · ${formatMoney(s.value)}`,
    fill: s.isWon ? 'var(--success)' : s.isLost ? 'var(--danger)' : undefined,
  }));
  const steps = stages.filter((s) => s.toNext);
  const empty = stages.every((s) => s.count === 0 && s.reached === 0);
  return (
    <Panel title="Funil">
      {empty ? (
        <Empty>Nenhuma negociação ainda. Crie uma a partir de um lead.</Empty>
      ) : (
        <>
          <HBarChart
            data={data}
            label="Negociações por etapa, com quantidade e valor"
            labelWidth={150}
            nameWidth={112}
          />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-label font-semibold text-text-muted">Conversão por etapa</h3>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {steps.map((s) => (
                <div key={s.id} className="flex items-baseline justify-between gap-2 text-body">
                  <dt className="min-w-0 truncate text-text-muted">
                    {s.name} → {s.toNext!.name}
                  </dt>
                  <dd className="tabular font-medium">{formatPercent(s.toNext!.rate)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </Panel>
  );
}
