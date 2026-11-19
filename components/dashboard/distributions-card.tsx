import { statusLabel } from '@/lib/leads/labels';
import type { Distributions } from '@/lib/services/dashboard';
import { HBarChart, type BarDatum } from './lazy-charts';
import { Empty, Panel } from './panel';

const bars = (rows: { name: string; count: number; fill?: string }[]): BarDatum[] =>
  rows.map((r) => ({ name: r.name, value: r.count, text: String(r.count), fill: r.fill }));

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-label font-semibold text-text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Leads por status, nicho (top 10), região (top 10) e faixa de score, no período escolhido. */
export function DistributionsCard({ d }: { d: Distributions }) {
  const total = d.score.high + d.score.mid + d.score.low;
  const { green, yellow } = d.score.thresholds;
  return (
    <Panel title="Distribuição dos leads">
      {total === 0 ? (
        <Empty>Nenhum lead entrou neste período com esses filtros.</Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Block title="Por status">
            <HBarChart
              label="Leads por status"
              data={bars(d.status.map((s) => ({ name: statusLabel[s.status], count: s.count })))}
            />
          </Block>
          <Block title="Por faixa de score">
            <HBarChart
              label="Leads por faixa de score"
              nameWidth={128}
              data={bars([
                { name: `Alto (${green}+)`, count: d.score.high, fill: 'var(--success)' },
                {
                  name: `Médio (${yellow}–${green - 1})`,
                  count: d.score.mid,
                  fill: 'var(--warning)',
                },
                { name: `Baixo (<${yellow})`, count: d.score.low, fill: 'var(--danger)' },
              ])}
            />
          </Block>
          <Block title="Por nicho (top 10)">
            <HBarChart
              label="Leads por nicho"
              nameWidth={170}
              data={bars(d.niche.map((r) => ({ name: r.label, count: r.count })))}
            />
          </Block>
          <Block title="Por região (top 10)">
            <HBarChart
              label="Leads por região"
              nameWidth={150}
              data={bars(
                d.region.map((r) => ({
                  name: r.label.replace(/^[A-Z]{2} - /, ''),
                  count: r.count,
                })),
              )}
            />
          </Block>
        </div>
      )}
    </Panel>
  );
}
