import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivityTimeline } from '@/components/dashboard/activity';
import { DashboardAlerts } from '@/components/dashboard/alerts';
import { BestNextCard } from '@/components/dashboard/best-next';
import { DistributionsCard } from '@/components/dashboard/distributions-card';
import { DashboardFilters } from '@/components/dashboard/filters';
import { FollowupsCard } from '@/components/dashboard/followups-card';
import { FunnelCard } from '@/components/dashboard/funnel-card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Empty, Panel } from '@/components/dashboard/panel';
import { ProspectingCard } from '@/components/dashboard/prospecting-card';
import { rowToView } from '@/components/reminders/view';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getDb, schema } from '@/lib/db';
import { periodLabel, parseDashboardFilters } from '@/lib/dashboard/filters';
import { formatMoney, formatPercent } from '@/lib/format';
import { getCatalog } from '@/lib/services/catalog';
import { getDashboard } from '@/lib/services/dashboard';
import { whatsappLinks } from '@/lib/services/reminders';

export const metadata: Metadata = { title: 'Início' };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const filters = parseDashboardFilters(await searchParams);
  const db = getDb();
  const now = new Date();
  const [d, cat, anyLead] = await Promise.all([
    getDashboard(db, filters, now),
    getCatalog(db),
    db.select({ id: schema.leads.id }).from(schema.leads).limit(1),
  ]);
  const when =
    filters.period === 'all'
      ? 'em todo o período'
      : `nos últimos ${periodLabel[String(filters.period) as keyof typeof periodLabel]}`;
  const k = d.kpis;

  if (!anyLead.length)
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-page">Início</h1>
        <EmptyState
          icon={Inbox}
          title="Ainda não há leads"
          action={
            <Link href="/leads/importar" className={buttonVariants()}>
              Importar leads
            </Link>
          }
        >
          Importe a planilha de leads ou crie o primeiro lead; o painel se preenche sozinho.
        </EmptyState>
      </section>
    );

  const allRows = [...d.followups.overdue, ...d.followups.today, ...d.followups.next7];
  const links = await whatsappLinks(db, allRows, now);
  const view = (rows: typeof allRows) =>
    rows.map((r) => rowToView(r, now, links.get(r.id) ?? null));
  const bands = [
    {
      id: 'overdue',
      title: 'Atrasados',
      count: d.followups.counts.overdue,
      items: view(d.followups.overdue),
      tab: 'overdue',
    },
    {
      id: 'today',
      title: 'Hoje',
      count: d.followups.counts.today,
      items: view(d.followups.today),
      tab: 'today',
    },
    {
      id: 'next7',
      title: 'Próximos 7 dias',
      count: d.followups.counts.next7,
      items: view(d.followups.next7),
      tab: 'upcoming',
    },
  ];

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h1 className="text-page">Início</h1>
      <DashboardFilters niches={cat.niches} regions={cat.regions} />
      <DashboardAlerts alerts={d.alerts} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" data-testid="kpis">
        <KpiCard label="Leads novos" value={k.newLeads} hint={when} />
        <KpiCard label="Abordados" value={k.contacted} hint={when} />
        <KpiCard
          label="Taxa de resposta"
          value={formatPercent(k.responseRate.rate)}
          hint={`${k.responseRate.replied} de ${k.responseRate.contacted} abordados`}
        />
        <KpiCard
          label="Taxa de ganho"
          value={formatPercent(k.winRate.rate)}
          hint={`${k.winRate.won} ganhos · ${k.winRate.lost} perdidos`}
        />
        <KpiCard
          label="Valor em aberto"
          value={formatMoney(k.openValue.value)}
          hint={`Ponderado ${formatMoney(k.openValue.weighted)} · ${k.openValue.deals} negociações`}
        />
        <KpiCard
          label="Score médio"
          value={
            k.avgScore == null
              ? '—'
              : k.avgScore.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
          }
          hint="novos e a abordar"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <FollowupsCard bands={bands} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <BestNextCard leads={d.bestNext} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <FunnelCard stages={d.funnel} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <ProspectingCard p={d.prospecting} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <DistributionsCard d={d.distributions} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Panel title="Atividade recente">
            {d.activity.length ? (
              <div
                role="region"
                aria-label="Atividade recente, rolável"
                tabIndex={0}
                className="max-h-120 overflow-y-auto pr-1"
              >
                <ActivityTimeline items={d.activity} />
              </div>
            ) : (
              <Empty>Nada registrado ainda.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
