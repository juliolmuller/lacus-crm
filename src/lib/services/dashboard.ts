import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { type Db, schema } from '@/lib/db';
import { spDateTime, spYmd } from '@/lib/followups/business-days';
import { contactStatuses } from '@/lib/leads/labels';

import { syncOverview } from './calendar-sync';
import { getSetting } from './followup-settings';
import { reminderRow } from './reminders';

const {
  leads,
  deals,
  dealStages,
  dealStageHistory,
  interactions,
  reminders,
  niches,
  regions,
  prospectingQueue,
  apiUsageLog,
} = schema;

export type Period = 'all' | 30 | 7 | 90;
export interface DashboardFilters {
  niche?: null | number;
  period: Period;
  region?: null | number;
}

/**
 * Os 6 cards: `null` em taxas = denominador zero (a UI mostra "—").
 */
export type Kpis = Awaited<ReturnType<typeof kpis>>;
export type Followups = Awaited<ReturnType<typeof followups>>;
export type Funnel = Awaited<ReturnType<typeof funnel>>;
export type Distributions = Awaited<ReturnType<typeof distributions>>;
export type Prospecting = Awaited<ReturnType<typeof prospecting>>;
export type BestNext = Awaited<ReturnType<typeof bestNext>>;
export type Activity = Awaited<ReturnType<typeof recentActivity>>;
export type Alerts = Awaited<ReturnType<typeof alerts>>;
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

const DAY = 86_400_000;
const addDays = (ymd: string, n: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const iso = (d: Date): SQL<unknown> => sql`${d.toISOString()}::timestamptz`;
const n = (v: unknown): number => Number(v ?? 0);
const rate = (num: number, den: number): null | number => (den > 0 ? num / den : null);

/**
 * Janela do período em dias de São Paulo: "7 dias" = hoje e os 6 anteriores.
 */
function windowOf(f: DashboardFilters, now: Date) {
  const today = spYmd(now);
  const sinceYmd = f.period === 'all' ? null : addDays(today, -(f.period - 1));

  return {
    today,
    sinceYmd,
    since: sinceYmd ? spDateTime(sinceYmd, '00:00') : null,
    startTomorrow: spDateTime(addDays(today, 1), '00:00'),
    endNext7: spDateTime(addDays(today, 8), '00:00'),
  };
}

/**
 * Nicho e região valem para tudo que passa por um lead.
 */
const scope = (f: DashboardFilters): SQL[] => [
  ...(f.niche ? [eq(leads.nicheId, f.niche)] : []),
  ...(f.region ? [eq(leads.regionId, f.region)] : []),
];
/**
 * Data de entrada do lead: `included_at` ou, sem ela, o dia da criação em São
 * Paulo.
 */
const includedOn = sql`coalesce(${leads.includedAt}, (${leads.createdAt} at time zone 'America/Sao_Paulo')::date)`;
const includedInPeriod = (w: ReturnType<typeof windowOf>): SQL<unknown> | undefined =>
  w.sinceYmd ? sql`${includedOn} >= ${w.sinceYmd}::date` : undefined;
const CONTACT = sql`${interactions.type} not in ('note', 'system')`;

/**
 * KPIs. Fluxo (novos, abordados, respostas, ganho) respeita o período; estado
 * (valor em aberto, score médio) é o retrato de agora. Taxa de resposta = leads
 * abordados que também responderam ÷ leads abordados, contando só interações do
 * período.
 */
export async function kpis(db: Db, f: DashboardFilters, now = new Date()) {
  const w = windowOf(f, now);
  const sc = scope(f);

  const perLead = db
    .select({
      out: sql<boolean>`bool_or(${interactions.direction} = 'outbound')`.as('out'),
      inn: sql<boolean>`bool_or(${interactions.direction} = 'inbound')`.as('inn'),
    })
    .from(interactions)
    .innerJoin(leads, eq(leads.id, interactions.leadId))
    .where(and(CONTACT, w.since ? gte(interactions.occurredAt, w.since) : undefined, ...sc))
    .groupBy(interactions.leadId)
    .as('per_lead');

  const [[l], [i], [d]] = await Promise.all([
    db
      .select({
        newLeads: sql<number>`count(*) filter (where ${includedInPeriod(w) ?? sql`true`})`,
        avgScore: sql<
          null | string
        >`avg(${leads.score}) filter (where ${leads.contactStatus} in ('new', 'to_contact') and not ${leads.doNotContact})`,
      })
      .from(leads)
      .where(and(...sc)),
    db
      .select({
        contacted: sql<number>`count(*) filter (where ${perLead.out})`,
        replied: sql<number>`count(*) filter (where ${perLead.out} and ${perLead.inn})`,
      })
      .from(perLead),
    db
      .select({
        won: sql<number>`count(*) filter (where ${deals.status} = 'won' and ${w.since ? sql`${deals.wonAt} >= ${iso(w.since)}` : sql`true`})`,
        lost: sql<number>`count(*) filter (where ${deals.status} = 'lost' and ${w.since ? sql`${deals.lostAt} >= ${iso(w.since)}` : sql`true`})`,
        openCount: sql<number>`count(*) filter (where ${deals.status} = 'open')`,
        openValue: sql<string>`coalesce(sum(${deals.value}) filter (where ${deals.status} = 'open'), 0)`,
        weighted: sql<string>`coalesce(sum(${deals.value} * coalesce(${deals.probability}, ${dealStages.defaultProbability}, 0) / 100.0) filter (where ${deals.status} = 'open'), 0)`,
      })
      .from(deals)
      .innerJoin(leads, eq(leads.id, deals.leadId))
      .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
      .where(and(...sc)),
  ]);

  const contacted = n(i?.contacted);
  const replied = n(i?.replied);
  const won = n(d?.won);
  const lost = n(d?.lost);

  return {
    newLeads: n(l?.newLeads),
    contacted,
    responseRate: { rate: rate(replied, contacted), replied, contacted },
    winRate: { rate: rate(won, won + lost), won, lost },
    openValue: { value: n(d?.openValue), weighted: n(d?.weighted), deals: n(d?.openCount) },
    avgScore: l?.avgScore === null || l?.avgScore === undefined ? null : Number(l.avgScore),
  };
}

/**
 * Lembretes abertos em 3 faixas (atrasados, resto de hoje, próximos 7 dias),
 * até 8 por faixa.
 */
export async function followups(db: Db, f: DashboardFilters, now = new Date()) {
  const w = windowOf(f, now);
  const base = and(eq(reminders.status, 'open'), ...scope(f));
  const bands = {
    overdue: lt(reminders.dueAt, now),
    today: and(gte(reminders.dueAt, now), lt(reminders.dueAt, w.startTomorrow)),
    next7: and(gte(reminders.dueAt, w.startTomorrow), lt(reminders.dueAt, w.endNext7)),
  };
  const list = (band: SQL | undefined) =>
    db
      .select(reminderRow)
      .from(reminders)
      .innerJoin(leads, eq(leads.id, reminders.leadId))
      .where(and(base, band))
      .orderBy(asc(reminders.dueAt))
      .limit(8);

  const [[c], overdue, today, next7] = await Promise.all([
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${reminders.dueAt} < ${iso(now)})`,
        today: sql<number>`count(*) filter (where ${reminders.dueAt} >= ${iso(now)} and ${reminders.dueAt} < ${iso(w.startTomorrow)})`,
        next7: sql<number>`count(*) filter (where ${reminders.dueAt} >= ${iso(w.startTomorrow)} and ${reminders.dueAt} < ${iso(w.endNext7)})`,
      })
      .from(reminders)
      .innerJoin(leads, eq(leads.id, reminders.leadId))
      .where(base),
    list(bands.overdue),
    list(bands.today),
    list(bands.next7),
  ]);

  return {
    counts: { overdue: n(c?.overdue), today: n(c?.today), next7: n(c?.next7) },
    overdue,
    today,
    next7,
  };
}

/**
 * Barras por etapa (deals abertos agora; ganho e perdido só do período) e
 * conversão entre etapas consecutivas do caminho (abertas + ganho). "Chegou à
 * etapa N" = o deal passou por N ou por qualquer etapa seguinte (o histórico ou
 * a etapa atual), então pular etapa não infla a taxa e ela nunca passa de 100%.
 * Perdido não é etapa do caminho: o deal conta até onde chegou. Coorte = deals
 * criados no período.
 */
export async function funnel(db: Db, f: DashboardFilters, now = new Date()) {
  const w = windowOf(f, now);
  const sc = scope(f);
  const cs = alias(dealStages, 'cs');
  const hs = alias(dealStages, 'hs');

  const perDeal = db
    .select({
      reach:
        sql<number>`greatest(coalesce(max(${hs.sort}) filter (where not ${hs.isLost}), 0), case when ${cs.isLost} then 0 else ${cs.sort} end)`.as(
          'reach',
        ),
    })
    .from(deals)
    .innerJoin(leads, eq(leads.id, deals.leadId))
    .innerJoin(cs, eq(cs.id, deals.stageId))
    .leftJoin(dealStageHistory, eq(dealStageHistory.dealId, deals.id))
    .leftJoin(hs, eq(hs.id, dealStageHistory.toStageId))
    .where(and(w.since ? gte(deals.createdAt, w.since) : undefined, ...sc))
    .groupBy(deals.id, cs.sort, cs.isLost)
    .as('per_deal');

  const inWindow = (col: typeof deals.wonAt): SQL<unknown> =>
    w.since ? sql`${col} >= ${iso(w.since)}` : sql`true`;
  const [stages, counts, reach] = await Promise.all([
    db
      .select()
      .from(dealStages)
      .where(sql`${dealStages.archivedAt} is null`)
      .orderBy(asc(dealStages.sort)),
    db
      .select({
        stageId: deals.stageId,
        count: sql<number>`count(*)`,
        value: sql<string>`coalesce(sum(${deals.value}), 0)`,
      })
      .from(deals)
      .innerJoin(leads, eq(leads.id, deals.leadId))
      .where(
        and(
          sql`(${deals.status} = 'open' or (${deals.status} = 'won' and ${inWindow(deals.wonAt)}) or (${deals.status} = 'lost' and ${inWindow(deals.lostAt)}))`,
          ...sc,
        ),
      )
      .groupBy(deals.stageId),
    db
      .select({ reach: perDeal.reach, count: sql<number>`count(*)` })
      .from(perDeal)
      .groupBy(perDeal.reach),
  ]);

  const byStage = new Map(counts.map((c) => [c.stageId, c]));
  const reached = (sort: number): number =>
    reach.filter((r) => n(r.reach) >= sort).reduce((s, r) => s + n(r.count), 0);
  const path = stages.filter((s) => !s.isLost);

  return stages.map((s) => {
    const idx = path.findIndex((p) => p.id === s.id);
    const next = idx >= 0 ? path[idx + 1] : undefined;
    const here = idx >= 0 ? reached(s.sort) : 0;

    return {
      id: s.id,
      key: s.key,
      name: s.name,
      isWon: s.isWon,
      isLost: s.isLost,
      count: n(byStage.get(s.id)?.count),
      value: n(byStage.get(s.id)?.value),
      reached: here,
      /**
       * Deals que chegaram à próxima etapa ÷ deals que chegaram a esta (null:
       * sem próxima ou 0)
       */
      toNext: next ? { name: next.name, rate: rate(reached(next.sort), here) } : null,
    };
  });
}

/**
 * Leads por status, nicho (top 10), região (top 10) e faixa de score; filtrados
 * por período de entrada.
 */
export async function distributions(db: Db, f: DashboardFilters, now = new Date()) {
  const w = windowOf(f, now);
  const where = and(includedInPeriod(w), ...scope(f));
  const thresholds = await getSetting(db, 'score_thresholds');
  const top = (label: SQL<string>, id: SQL) =>
    db
      .select({ label, count: sql<number>`count(*)` })
      .from(leads)
      .innerJoin(niches, eq(niches.id, leads.nicheId))
      .innerJoin(regions, eq(regions.id, leads.regionId))
      .where(where)
      .groupBy(id, label)
      .orderBy(desc(sql`count(*)`), asc(label))
      .limit(10);

  const [status, niche, region, [band]] = await Promise.all([
    db
      .select({ status: leads.contactStatus, count: sql<number>`count(*)` })
      .from(leads)
      .where(where)
      .groupBy(leads.contactStatus),
    top(sql<string>`${niches.name}`, sql`${niches.id}`),
    top(sql<string>`${regions.label}`, sql`${regions.id}`),
    db
      .select({
        high: sql<number>`count(*) filter (where ${leads.score} >= ${thresholds.green})`,
        mid: sql<number>`count(*) filter (where ${leads.score} >= ${thresholds.yellow} and ${leads.score} < ${thresholds.green})`,
        low: sql<number>`count(*) filter (where ${leads.score} < ${thresholds.yellow})`,
      })
      .from(leads)
      .where(where),
  ]);
  const byStatus = new Map(status.map((s) => [s.status, n(s.count)]));

  return {
    status: contactStatuses
      .map((s) => ({ status: s, count: byStatus.get(s) ?? 0 }))
      .filter((s) => s.count > 0),
    niche: niche.map((r) => ({ label: r.label, count: n(r.count) })),
    region: region.map((r) => ({ label: r.label, count: n(r.count) })),
    score: {
      high: n(band?.high),
      mid: n(band?.mid),
      low: n(band?.low),
      thresholds: { green: thresholds.green, yellow: thresholds.yellow },
    },
  };
}

/**
 * Uso da API de Places hoje × orçamento, 14 dias de histórico e a fila (sem
 * filtros: é da rotina, não do lead).
 */
export async function prospecting(db: Db, now = new Date()) {
  const today = spYmd(now);
  const from = addDays(today, -13);
  const [budget, days, [q], [next]] = await Promise.all([
    getSetting(db, 'places_daily_budget'),
    db
      .select({
        day: apiUsageLog.day,
        requests: sql<number>`sum(${apiUsageLog.requests})`,
        saved: sql<number>`sum(${apiUsageLog.leadsSaved})`,
      })
      .from(apiUsageLog)
      .where(and(gte(apiUsageLog.day, from), sql`${apiUsageLog.day} <= ${today}`))
      .groupBy(apiUsageLog.day),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${prospectingQueue.status} = 'pending' and ${prospectingQueue.skippedAt} is null)`,
        done: sql<number>`count(*) filter (where ${prospectingQueue.status} = 'done')`,
        error: sql<number>`count(*) filter (where ${prospectingQueue.status} = 'error')`,
        skipped: sql<number>`count(*) filter (where ${prospectingQueue.skippedAt} is not null)`,
      })
      .from(prospectingQueue),
    db
      .select({ position: prospectingQueue.position, region: regions.label, niche: niches.name })
      .from(prospectingQueue)
      .innerJoin(regions, eq(regions.id, prospectingQueue.regionId))
      .innerJoin(niches, eq(niches.id, prospectingQueue.nicheId))
      .where(
        and(eq(prospectingQueue.status, 'pending'), sql`${prospectingQueue.skippedAt} is null`),
      )
      .orderBy(asc(prospectingQueue.sortOrder))
      .limit(1),
  ]);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const series = Array.from({ length: 14 }, (_, k) => {
    const day = addDays(from, k);

    return { day, requests: n(byDay.get(day)?.requests), saved: n(byDay.get(day)?.saved) };
  });
  const todayRow = series[13]!;

  return {
    budget,
    requestsToday: todayRow.requests,
    savedToday: todayRow.saved,
    overBudget: todayRow.requests > budget,
    series,
    queue: { pending: n(q?.pending), done: n(q?.done), error: n(q?.error), skipped: n(q?.skipped) },
    next: next ?? null,
  };
}

/**
 * Top 5 para abordar: `new`/`to_contact`, sem "Não contatar"; `priority` 1 é a
 * primeira, depois score.
 */
export async function bestNext(db: Db, f: DashboardFilters) {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      score: leads.score,
      priority: leads.priority,
      niche: niches.name,
      region: regions.label,
      hasWhatsapp: leads.hasWhatsapp,
    })
    .from(leads)
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(
      and(
        inArray(leads.contactStatus, ['new', 'to_contact']),
        eq(leads.doNotContact, false),
        ...scope(f),
      ),
    )
    .orderBy(sql`${leads.priority} asc nulls last`, desc(leads.score), asc(leads.name))
    .limit(5);
}

export type ActivityItem =
  | {
      at: Date;
      direction: string;
      kind: 'interaction';
      leadId: string;
      leadName: string;
      summary: string;
      type: string;
    }
  | {
      at: Date;
      from: null | string;
      kind: 'move';
      leadId: string;
      leadName: string;
      source: string;
      to: string;
    }
  | { at: Date; kind: 'mcp_lead'; leadId: string; leadName: string };

/**
 * Últimas 15 entre interações, movimentações de deal e leads criados por MCP.
 */
export async function recentActivity(db: Db, f: DashboardFilters): Promise<ActivityItem[]> {
  const sc = scope(f);
  const from = alias(dealStages, 'from_stage');
  const [ia, mv, mcp] = await Promise.all([
    db
      .select({
        at: interactions.occurredAt,
        leadId: leads.id,
        leadName: leads.name,
        type: interactions.type,
        direction: interactions.direction,
        summary: interactions.summary,
      })
      .from(interactions)
      .innerJoin(leads, eq(leads.id, interactions.leadId))
      .where(and(...sc))
      .orderBy(desc(interactions.occurredAt))
      .limit(15),
    db
      .select({
        at: dealStageHistory.movedAt,
        leadId: leads.id,
        leadName: leads.name,
        from: from.name,
        to: dealStages.name,
        source: dealStageHistory.source,
      })
      .from(dealStageHistory)
      .innerJoin(deals, eq(deals.id, dealStageHistory.dealId))
      .innerJoin(leads, eq(leads.id, deals.leadId))
      .innerJoin(dealStages, eq(dealStages.id, dealStageHistory.toStageId))
      .leftJoin(from, eq(from.id, dealStageHistory.fromStageId))
      .where(and(...sc))
      .orderBy(desc(dealStageHistory.movedAt))
      .limit(15),
    db
      .select({ at: leads.createdAt, leadId: leads.id, leadName: leads.name })
      .from(leads)
      .where(and(eq(leads.dataSource, 'mcp'), ...sc))
      .orderBy(desc(leads.createdAt))
      .limit(15),
  ]);
  const items: ActivityItem[] = [
    ...ia.map((r) => ({ kind: 'interaction' as const, ...r })),
    ...mv.map((r) => ({ kind: 'move' as const, ...r })),
    ...mcp.map((r) => ({ kind: 'mcp_lead' as const, ...r })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 15);
}

export interface Alert {
  href: string;
  kind: 'google_reauth' | 'over_budget' | 'queue_errors' | 'sync_errors';
  message: string;
}

/**
 * Alertas da SPEC 6.1. O banner do shell já cobre o Google; a tela mostra os
 * demais.
 */
export async function alerts(db: Db, p: Prospecting): Promise<Alert[]> {
  const g = await syncOverview(db);
  const out: Alert[] = [];

  if (g.status === 'needs_reauth')
    out.push({
      kind: 'google_reauth',
      message: 'O Google Calendar precisa ser reconectado.',
      href: '/configuracoes#google',
    });
  else if (g.status === 'active' && g.errors > 0)
    out.push({
      kind: 'sync_errors',
      message: `${g.errors} ${g.errors === 1 ? 'lembrete não sincronizou' : 'lembretes não sincronizaram'} com o Google Calendar.`,
      href: '/configuracoes#google',
    });

  if (p.queue.error > 0)
    out.push({
      kind: 'queue_errors',
      message: `${p.queue.error} ${p.queue.error === 1 ? 'item da fila de prospecção está' : 'itens da fila de prospecção estão'} com erro.`,
      href: '/fila',
    });

  if (p.overBudget)
    out.push({
      kind: 'over_budget',
      message: `O uso da API de Places hoje (${p.requestsToday}) passou do orçamento diário (${p.budget}).`,
      href: '/fila',
    });

  return out;
}

/**
 * Tudo da tela inicial (e do `crm_dashboard_summary` do MCP) em poucas queries
 * paralelas.
 */
export async function getDashboard(db: Db, f: DashboardFilters, now = new Date()) {
  const [k, fu, fn, di, pr, bn, ac] = await Promise.all([
    kpis(db, f, now),
    followups(db, f, now),
    funnel(db, f, now),
    distributions(db, f, now),
    prospecting(db, now),
    bestNext(db, f),
    recentActivity(db, f),
  ]);

  return {
    filters: f,
    kpis: k,
    followups: fu,
    funnel: fn,
    distributions: di,
    prospecting: pr,
    bestNext: bn,
    activity: ac,
    alerts: await alerts(db, pr),
  };
}
