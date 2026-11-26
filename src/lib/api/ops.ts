import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';

import { type Scope } from '@/lib/auth/mcp-resources';
import { type Db, schema } from '@/lib/db';
import { snoozePresets } from '@/lib/followups/snooze';
import { renderTemplate, templateValues } from '@/lib/followups/templates';
import { parseFilters } from '@/lib/leads/filters-server';
import { contactStatuses, interactionTypes, websiteStatuses } from '@/lib/leads/labels';
import { whatsappUrl } from '@/lib/leads/links';
import { logUsage, usageToday } from '@/lib/services/api-usage';
import { audit } from '@/lib/services/audit';
import { getCatalog } from '@/lib/services/catalog';
import { getDashboard, toPeriod } from '@/lib/services/dashboard';
import { createDeal, loseDeal, moveDeal, winDeal } from '@/lib/services/deals';
import { saveDiagnosis } from '@/lib/services/diagnosis';
import { getSetting } from '@/lib/services/followup-settings';
import { logInteraction } from '@/lib/services/interactions';
import { listLeads } from '@/lib/services/lead-list';
import { getLead, type LeadValues, setDoNotContact, updateLead } from '@/lib/services/leads';
import { claimNext, completeItem } from '@/lib/services/queue';
import {
  completeReminder,
  createReminder,
  listReminders,
  snoozeReminder,
} from '@/lib/services/reminders';
import { upsertLeads } from '@/lib/services/upsert-leads';
import { upsertInput } from '@/lib/validation/upsert';

import { ApiError } from './errors';

const { leads, deals, dealStages, interactions, reminders, messageTemplates, niches, regions } =
  schema;

export interface OpCtx {
  actor: string;
  db: Db;
}

/**
 * Uma operação de negócio: serve de ferramenta MCP e de endpoint REST
 * (adaptadores finos).
 */
export interface Op<S extends z.ZodType = z.ZodType> {
  description: string;
  input: S;
  /**
   * Nome da ferramenta MCP.
   */
  name: string;
  /**
   * Também exposta em `/api/mcp/prospecting`
   */
  prospecting?: boolean;
  run: (args: z.infer<S>, ctx: OpCtx) => Promise<unknown>;
  /**
   * Basta um destes escopos (`write` cobre `read`)
   */
  scopes: Scope[];
}
const op = <S extends z.ZodType>(o: Op<S>): Op<S> => o;

const id = z.uuid();
/**
 * ISO 8601 com fuso; texto puro para o JSON Schema do MCP.
 */
const when = z.iso.datetime({ offset: true });
const limit = z.number().int().min(1).max(50).default(50);
const cursor = z.string().optional().describe('`nextCursor` da página anterior');

/**
 * Cursor de offset para listas já carregadas (lembretes, nichos, regiões).
 */
const page = <T>(
  rows: T[],
  cur: string | undefined,
  lim: number,
): { items: T[]; nextCursor: null | string } => {
  const from = cur ? Number(Buffer.from(cur, 'base64url').toString()) || 0 : 0;
  const items = rows.slice(from, from + lim);
  const next =
    from + lim < rows.length ? Buffer.from(String(from + lim)).toString('base64url') : null;

  return { items, nextCursor: next };
};

const found = <T>(v: null | T | undefined, what = 'Lead'): T => {
  if (!v) throw new ApiError('not_found', `${what} não encontrado`);

  return v;
};

// ---------- leitura ----------
export const searchLeads = op({
  name: 'crm_search_leads',
  description:
    'Busca leads por texto, status, nicho, região, score, negociação aberta, prioridade (Top leads) ou link de sessão (até 50, com cursor). Cada item traz prioridade e sessionUrl.',
  scopes: ['read'],
  input: z.object({
    query: z.string().optional(),
    status: z.array(z.enum(contactStatuses as [string, ...string[]])).optional(),
    nicheId: z.number().int().optional(),
    regionLabel: z.string().optional(),
    minScore: z.number().int().optional(),
    hasOpenDeal: z.boolean().optional(),
    hasPriority: z
      .boolean()
      .optional()
      .describe('true: só leads da lista "Top leads" (com prioridade)'),
    hasSessionUrl: z
      .boolean()
      .optional()
      .describe('false: só leads sem link de sessão (ainda não diagnosticados)'),
    sort: z
      .enum(['score', 'priority'])
      .default('score')
      .describe('score: maior primeiro; priority: menor primeiro (use com hasPriority: true)'),
    limit,
    cursor,
  }),
  async run(a, { db }) {
    let region: null | number = null;

    if (a.regionLabel) {
      const [r] = await db
        .select({ id: regions.id })
        .from(regions)
        .where(eq(regions.label, a.regionLabel));

      if (!r) return { items: [], nextCursor: null };

      region = r.id;
    }

    const f = {
      ...parseFilters({}),
      q: a.query ?? '',
      status: (a.status ?? []) as Array<(typeof contactStatuses)[number]>,
      niche: a.nicheId ?? null,
      region,
      smin: a.minScore ?? null,
      deal:
        a.hasOpenDeal === undefined ? null : a.hasOpenDeal ? ('open' as const) : ('none' as const),
      sort: a.sort,
      dir: a.sort === 'priority' ? ('asc' as const) : ('desc' as const),
      hasPriority: a.hasPriority,
      hasSession: a.hasSessionUrl,
    };
    const { rows, nextCursor } = await listLeads(db, f, a.cursor, a.limit);

    return {
      items: rows.map((r) => ({ ...r, sortValue: undefined })),
      nextCursor,
    };
  },
});

export const getLeadFull = op({
  name: 'crm_get_lead',
  description:
    'Lead completo, negociação aberta, 20 últimas interações e lembretes abertos. Informe `id` ou `placeId`.',
  scopes: ['read'],
  input: z
    .object({ id: id.optional(), placeId: z.string().optional() })
    .refine((v) => v.id || v.placeId, {
      message: 'Informe id ou placeId',
    }),
  async run(a, { db }) {
    const leadId =
      a.id
      ?? (await db.select({ id: leads.id }).from(leads).where(eq(leads.placeId, a.placeId!)))[0]
        ?.id;
    const base = found(leadId ? await getLead(db, leadId) : null);
    const [openDeal, recent, open] = await Promise.all([
      db
        .select({ deal: deals, stage: dealStages.key })
        .from(deals)
        .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
        .where(and(eq(deals.leadId, base.lead.id), eq(deals.status, 'open'))),
      db
        .select()
        .from(interactions)
        .where(eq(interactions.leadId, base.lead.id))
        .orderBy(desc(interactions.occurredAt))
        .limit(20),
      db
        .select()
        .from(reminders)
        .where(and(eq(reminders.leadId, base.lead.id), eq(reminders.status, 'open')))
        .orderBy(asc(reminders.dueAt)),
    ]);

    return {
      lead: base.lead,
      niche: base.niche.name,
      region: base.region.label,
      openDeal: openDeal[0] ? { ...openDeal[0].deal, stageKey: openDeal[0].stage } : null,
      interactions: recent,
      reminders: open,
    };
  },
});

export const listRemindersOp = op({
  name: 'crm_list_reminders',
  description: 'Lembretes abertos: atrasados, de hoje ou dos próximos 7 dias.',
  scopes: ['read'],
  input: z.object({ range: z.enum(['overdue', 'today', 'next7']), limit, cursor }),
  async run(a, { db }) {
    const now = new Date();
    const rows =
      a.range === 'next7'
        ? [
            ...(await listReminders(db, 'today', now)).rows,
            ...(await listReminders(db, 'upcoming', now)).rows.filter(
              (r) => +r.dueAt < +now + 7 * 86_400_000,
            ),
          ]
        : (await listReminders(db, a.range, now)).rows;

    return page(
      rows.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        leadName: r.leadName,
        title: r.title,
        notes: r.notes,
        dueAt: r.dueAt,
        status: r.status,
      })),
      a.cursor,
      a.limit,
    );
  },
});

export const renderMessage = op({
  name: 'crm_render_message',
  description:
    'Renderiza um modelo de mensagem para o lead e devolve o texto e o link do WhatsApp. Nunca envia.',
  scopes: ['read'],
  input: z.object({ leadId: id, templateKey: z.string() }),
  async run(a, { db }) {
    const base = found(await getLead(db, a.leadId));
    const [tpl] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.key, a.templateKey));

    found(tpl, 'Modelo');

    const profile = await getSetting(db, 'owner_profile');
    const m = renderTemplate(
      tpl!.body,
      templateValues(base.lead, base.niche, base.region, profile),
    );

    return {
      text: m.text,
      missing: m.missing,
      blocked: m.blocked,
      waLink: m.blocked ? null : whatsappUrl(base.lead.phoneE164, m.text),
    };
  },
});

export const dashboardSummary = op({
  name: 'crm_dashboard_summary',
  description:
    'KPIs, follow-ups, funil, distribuições, prospecção e alertas do painel. Período: 7, 30 ou 90 dias, ou "all" (padrão 30).',
  scopes: ['read'],
  input: z.object({
    period: z
      .union([z.literal(7), z.literal(30), z.literal(90), z.enum(['7', '30', '90', 'all'])])
      .default(30)
      .describe('Dias (7, 30 ou 90) ou "all"; padrão 30'),
  }),
  run: (a, { db }) => getDashboard(db, { period: toPeriod(a.period) }),
});

export const nichesList = op({
  name: 'niches_list',
  description: 'Nichos cadastrados (com os dados usados no score).',
  scopes: ['read', 'prospecting'],
  prospecting: true,
  input: z.object({ cursor, limit }),
  async run(a, { db }) {
    const rows = await db.select().from(niches).orderBy(asc(niches.name));

    return page(rows, a.cursor, a.limit);
  },
});

export const regionsList = op({
  name: 'regions_list',
  description: 'Regiões cadastradas (label "UF - Cidade - Bairro").',
  scopes: ['read', 'prospecting'],
  prospecting: true,
  input: z.object({ cursor, limit }),
  async run(a, { db }) {
    const { regions: all } = await getCatalog(db);

    return page(all, a.cursor, a.limit);
  },
});

// ---------- escrita ----------
const diagnosisFields = {
  complaints: z.string().nullable(),
  decision_maker_contact: z.string().nullable(),
  email: z.string().nullable(),
  has_active_ads: z.boolean(),
  has_whatsapp: z.boolean(),
  instagram: z.string().nullable(),
  instagram_active: z.boolean(),
  other_socials: z.string().nullable(),
  owner_replies_reviews: z.boolean().nullable(),
  strong_local_competition: z.boolean(),
  website_status: z.enum(websiteStatuses as [string, ...string[]]),
  website_url: z.string().nullable(),
};
const patch = z
  .object({
    session_url: z.string().nullable(),
    next_action: z.string().nullable(),
    pitch: z.string().nullable(),
    priority: z.number().int().nullable(),
    contact_status: z.enum(contactStatuses as [string, ...string[]]),
    notes: z.string().nullable(),
    channel: z.string().nullable(),
    response_or_objection: z.string().nullable(),
    ...diagnosisFields,
  })
  .partial()
  .strict();

const leadValues = (p: z.infer<typeof patch>): LeadValues => ({
  ...('session_url' in p ? { sessionUrl: p.session_url } : {}),
  ...('next_action' in p ? { nextAction: p.next_action } : {}),
  ...('pitch' in p ? { pitch: p.pitch } : {}),
  ...('priority' in p ? { priority: p.priority } : {}),
  ...(p.contact_status
    ? { contactStatus: p.contact_status as (typeof contactStatuses)[number] }
    : {}),
  ...('notes' in p ? { notes: p.notes } : {}),
  ...('channel' in p ? { channel: p.channel } : {}),
  ...('response_or_objection' in p ? { responseOrObjection: p.response_or_objection } : {}),
  ...('complaints' in p ? { complaints: p.complaints } : {}),
  ...('decision_maker_contact' in p ? { decisionMakerContact: p.decision_maker_contact } : {}),
  ...('email' in p ? { email: p.email } : {}),
  ...('has_active_ads' in p ? { hasActiveAds: p.has_active_ads } : {}),
  ...('has_whatsapp' in p ? { hasWhatsapp: p.has_whatsapp } : {}),
  ...('instagram' in p ? { instagram: p.instagram } : {}),
  ...('instagram_active' in p ? { instagramActive: p.instagram_active } : {}),
  ...('other_socials' in p ? { otherSocials: p.other_socials } : {}),
  ...('owner_replies_reviews' in p ? { ownerRepliesReviews: p.owner_replies_reviews } : {}),
  ...('strong_local_competition' in p
    ? { strongLocalCompetition: p.strong_local_competition }
    : {}),
  ...('website_status' in p
    ? { websiteStatus: p.website_status as (typeof websiteStatuses)[number] }
    : {}),
  ...('website_url' in p ? { websiteUrl: p.website_url } : {}),
});

export const updateLeadOp = op({
  name: 'crm_update_lead',
  description:
    'Atualiza campos permitidos do lead: session_url, next_action, pitch, priority, contact_status, notes, channel, response_or_objection e os campos do diagnóstico (website_url, website_status, instagram, other_socials, email, decision_maker_contact, has_whatsapp, has_active_ads, instagram_active, owner_replies_reviews, complaints, strong_local_competition). Recalcula o score.',
  scopes: ['write'],
  input: z.object({ id, patch }),
  async run(a, { db, actor }) {
    const p = a.patch;

    return db.transaction(async (tx) => {
      const lead = await updateLead(tx, a.id, leadValues(p));

      await audit(tx, {
        entity: 'lead',
        entityId: a.id,
        action: 'update',
        actor,
        diff: { fields: Object.keys(p) },
      });

      return lead;
    });
  },
});

export const saveDiagnosisOp = op({
  name: 'crm_save_diagnosis',
  description:
    'Salva o diagnóstico de um lead de uma vez: grava os campos confirmados em `patch` (mesmos de crm_update_lead, incluindo session_url, pitch e next_action), registra `diagnosis` como nota interna na linha do tempo e, com advance (padrão true), move a negociação aberta de "A diagnosticar" para "A abordar". Se o lead não tem negociação aberta ou ela já passou dessa etapa, só grava e informa o motivo em dealMoved.',
  scopes: ['write'],
  input: z.object({
    id,
    patch,
    diagnosis: z.string().min(1).optional(),
    advance: z.boolean().default(true),
  }),
  run: (a, { db, actor }) =>
    saveDiagnosis(db, {
      actor,
      advance: a.advance,
      diagnosis: a.diagnosis,
      leadId: a.id,
      values: leadValues(a.patch),
    }),
});

export const setDnc = op({
  name: 'crm_set_do_not_contact',
  description:
    'Marca o lead como "Não contatar" (cancela lembretes, perde negociações e, com optOut, suprime).',
  scopes: ['write'],
  input: z.object({ id, reason: z.string().min(1), optOut: z.boolean().default(false) }),
  async run(a, { db, actor }) {
    await db.transaction(async (tx) => {
      await setDoNotContact(tx, a.id, { reason: a.reason, optOut: a.optOut });
      await audit(tx, {
        entity: 'lead',
        entityId: a.id,
        action: 'do_not_contact',
        actor,
        diff: { optOut: a.optOut },
      });
    });

    return { id: a.id, doNotContact: true, optOut: a.optOut };
  },
});

export const logInteractionOp = op({
  name: 'crm_log_interaction',
  description:
    'Registra uma interação (aplica as regras de follow-up e a sincronia de status). `summary` é o título curto que aparece na linha do tempo (até ~120 caracteres); o detalhe (texto completo, links, diagnóstico) vai em `body`, até 5000 caracteres.',
  scopes: ['write'],
  input: z.object({
    leadId: id,
    dealId: id.nullable().optional(),
    type: z.enum(interactionTypes as unknown as [string, ...string[]]),
    direction: z.enum(['outbound', 'inbound', 'internal']),
    outcome: z
      .enum([
        'no_answer',
        'replied',
        'interested',
        'not_interested',
        'asked_later',
        'meeting_set',
        'proposal_requested',
        'opt_out',
      ])
      .optional(),
    summary: z
      .string()
      .min(1)
      .describe('Título curto da interação (recomendado até ~120 caracteres)'),
    body: z
      .string()
      .trim()
      .max(5000)
      .nullable()
      .optional()
      .describe('Detalhe da interação (até 5000 caracteres); vazio vira null'),
    occurredAt: when.optional(),
  }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const r = await logInteraction(tx, {
        ...a,
        body: a.body || null,
        occurredAt: a.occurredAt ? new Date(a.occurredAt) : undefined,
        type: a.type as Parameters<typeof logInteraction>[1]['type'],
        createdBy: 'mcp',
      });

      await audit(tx, {
        entity: 'interaction',
        entityId: String(r.interaction.id),
        action: 'create',
        actor,
        diff: { leadId: a.leadId },
      });

      return r;
    });
  },
});

export const createDealOp = op({
  name: 'crm_create_deal',
  description: 'Cria uma negociação para o lead (etapa padrão: A diagnosticar).',
  scopes: ['write'],
  input: z.object({
    leadId: id,
    title: z.string().optional(),
    value: z.string().nullable().optional(),
    stageKey: z.string().optional(),
  }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const d = await createDeal(tx, { ...a, source: 'mcp' });

      await audit(tx, {
        entity: 'deal',
        entityId: d.id,
        action: 'create',
        actor,
        diff: { leadId: a.leadId },
      });

      return d;
    });
  },
});

export const moveDealOp = op({
  name: 'crm_move_deal',
  description:
    'Move a negociação para outra etapa (topo ou fim da coluna). Ganho/Perdido usam `lostReason`.',
  scopes: ['write'],
  input: z.object({
    dealId: id,
    stageKey: z.string(),
    placement: z.enum(['top', 'bottom']).default('bottom'),
    lostReason: z.string().optional(),
  }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const [stage] = await tx.select().from(dealStages).where(eq(dealStages.key, a.stageKey));

      found(stage, 'Etapa');

      let out;

      if (stage!.isWon) out = await winDeal(tx, { dealId: a.dealId });
      else if (stage!.isLost) {
        if (!a.lostReason)
          throw new ApiError('validation_error', 'lostReason é obrigatório para Perdido');

        out = await loseDeal(tx, { dealId: a.dealId, reason: a.lostReason });
      } else {
        const [first] =
          a.placement === 'top'
            ? await tx
                .select({ id: deals.id })
                .from(deals)
                .where(
                  and(
                    eq(deals.stageId, stage!.id),
                    eq(deals.status, 'open'),
                    ne(deals.id, a.dealId),
                  ),
                )
                .orderBy(asc(deals.position))
                .limit(1)
            : [];

        out = await moveDeal(tx, {
          dealId: a.dealId,
          stageId: stage!.id,
          source: 'mcp',
          nextId: first?.id ?? null,
        });
      }

      await audit(tx, {
        entity: 'deal',
        entityId: a.dealId,
        action: 'move',
        actor,
        diff: { stageKey: a.stageKey },
      });

      return out;
    });
  },
});

export const createReminderOp = op({
  name: 'crm_create_reminder',
  description: 'Cria um lembrete para o lead.',
  scopes: ['write'],
  input: z.object({
    leadId: id,
    dealId: id.nullable().optional(),
    title: z.string().min(1),
    notes: z.string().nullable().optional(),
    dueAt: when,
    durationMin: z.number().int().min(1).optional(),
  }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const r = await createReminder(tx, { ...a, dueAt: new Date(a.dueAt), source: 'mcp' });

      await audit(tx, { entity: 'reminder', entityId: r.id, action: 'create', actor });

      return r;
    });
  },
});

export const completeReminderOp = op({
  name: 'crm_complete_reminder',
  description: 'Conclui um lembrete.',
  scopes: ['write'],
  input: z.object({ id }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const r = await completeReminder(tx, a.id);

      await audit(tx, { entity: 'reminder', entityId: a.id, action: 'complete', actor });

      return r;
    });
  },
});

export const snoozeReminderOp = op({
  name: 'crm_snooze_reminder',
  description: 'Adia um lembrete: `preset` (1h, tomorrow, plus2bd) ou `until` (data/hora).',
  scopes: ['write'],
  input: z
    .object({ id, preset: z.enum(snoozePresets).optional(), until: when.optional() })
    .refine((v) => v.preset || v.until, { message: 'Informe preset ou until' }),
  async run(a, { db, actor }) {
    return db.transaction(async (tx) => {
      const r = await snoozeReminder(tx, a.id, a.until ? { at: new Date(a.until) } : a.preset!);

      await audit(tx, { entity: 'reminder', entityId: a.id, action: 'snooze', actor });

      return r;
    });
  },
});

// ---------- prospecção ----------
export const upsertLeadsOp = op({
  name: 'crm_upsert_leads',
  description:
    'Cria ou atualiza leads vindos da prospecção (idempotente por runId; só campos de máquina em leads existentes).',
  scopes: ['write', 'prospecting'],
  prospecting: true,
  input: upsertInput,
  run: (a, { db, actor }) => upsertLeads(db, a, actor),
});

export const queueClaimNext = op({
  name: 'queue_claim_next',
  description:
    'Pega o próximo item da fila (lease de 30 min). Repetir com o mesmo runId devolve o mesmo item. `null` se vazia.',
  scopes: ['prospecting'],
  prospecting: true,
  input: z.object({ runId: z.string().min(1).max(200) }),
  async run(a, { db }) {
    return { item: await claimNext(db, a.runId) };
  },
});

export const queueComplete = op({
  name: 'queue_complete',
  description: 'Conclui o item da fila (idempotente).',
  scopes: ['prospecting'],
  prospecting: true,
  input: z.object({
    position: z.number().int(),
    runId: z.string().min(1).max(200),
    status: z.enum(['done', 'error']),
    leadsAdded: z.number().int().min(0).default(0),
    notes: z.string().nullable().optional(),
  }),
  async run(a, { db }) {
    return { item: found(await completeItem(db, a), 'Item da fila') };
  },
});

export const apiUsageToday = op({
  name: 'api_usage_today',
  description: 'Uso da API de Places hoje: `{requestsToday, budget, remaining}`.',
  scopes: ['prospecting'],
  prospecting: true,
  input: z.object({}),
  run: (_a, { db }) => usageToday(db),
});

export const apiUsageLog = op({
  name: 'api_usage_log',
  description: 'Registra o uso da API (um registro por runId; repetir não soma de novo).',
  scopes: ['prospecting'],
  prospecting: true,
  input: z.object({
    runId: z.string().min(1).max(200),
    queuePosition: z.number().int().optional(),
    requests: z.number().int().min(0),
    leadsSaved: z.number().int().min(0).default(0),
    note: z.string().nullable().optional(),
  }),
  run: (a, { db }) => logUsage(db, a),
});

export const ALL_OPS = [
  searchLeads,
  getLeadFull,
  upsertLeadsOp,
  updateLeadOp,
  saveDiagnosisOp,
  setDnc,
  logInteractionOp,
  createDealOp,
  moveDealOp,
  listRemindersOp,
  createReminderOp,
  completeReminderOp,
  snoozeReminderOp,
  renderMessage,
  dashboardSummary,
  queueClaimNext,
  queueComplete,
  apiUsageToday,
  apiUsageLog,
  nichesList,
  regionsList,
] as const;
export const opByName = new Map<string, Op>(ALL_OPS.map((o) => [o.name, o as unknown as Op]));

export { inArray };
