import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { suppressionKeys } from '@/lib/hash';
import { spDate } from '@/lib/leads/csv';
import { normalizeName, normalizePhone, type ParsedPlace } from '@/lib/normalize';
import { computeScore, type ScoreNiche, type ScoreSettings } from '@/lib/score';
import { parseSetting, settingDefaults } from '@/lib/validation/settings';

const { leads, niches, regions, settings, suppressionList, deals, dealStages, dealStageHistory } =
  schema;
const { reminders, interactions } = schema;

export type Lead = typeof leads.$inferSelect;
/** Campos editáveis (colunas do banco, valores já convertidos). Os derivados são calculados aqui. */
export type LeadValues = Partial<
  Omit<
    typeof leads.$inferInsert,
    | 'phoneE164'
    | 'nameNormalized'
    | 'score'
    | 'scoreBreakdown'
    | 'scoreComputedAt'
    | 'doNotContact'
    | 'doNotContactAt'
    | 'doNotContactReason'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export class LeadError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'NAME_MISMATCH' | 'SUPPRESSED' | 'ALREADY_DNC',
    message: string,
  ) {
    super(message);
  }
}

const sameValue = (key: string, a: unknown, b: unknown) => {
  if (key === 'lastContactAt') {
    // a planilha e o formulário só têm a data: compara o dia em São Paulo
    return (a instanceof Date ? spDate(a) : null) === (b instanceof Date ? spDate(b) : null);
  }
  if (a instanceof Date || b instanceof Date) return +new Date(a as Date) === +new Date(b as Date);
  return (a ?? null) === (b ?? null);
};

/** Chaves do patch cujo valor difere do lead atual (evita regravar o que não mudou). */
export const changedFields = (current: object, patch: object) =>
  Object.entries(patch)
    .filter(([k, v]) => !sameValue(k, (current as Record<string, unknown>)[k], v))
    .map(([k]) => k);

export async function getScoreSettings(db: Db): Promise<ScoreSettings> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ['score_weights', 'score_thresholds']));
  const get = <K extends 'score_weights' | 'score_thresholds'>(key: K) =>
    parseSetting(key, rows.find((r) => r.key === key)?.value ?? settingDefaults[key]);
  return { weights: get('score_weights'), thresholds: get('score_thresholds') };
}

/** Campos calculados a partir do lead completo: telefone E.164, nome normalizado e score. */
export function deriveFields(
  lead: Lead | (LeadValues & { name: string }),
  niche: ScoreNiche,
  s: ScoreSettings,
) {
  const { score, breakdown } = computeScore(
    {
      websiteStatus: lead.websiteStatus ?? 'unknown',
      mapsRating: lead.mapsRating ?? null,
      mapsReviews: lead.mapsReviews ?? null,
      hasActiveAds: lead.hasActiveAds ?? false,
      instagramActive: lead.instagramActive ?? false,
      hasWhatsapp: lead.hasWhatsapp ?? false,
      decisionMakerContact: lead.decisionMakerContact ?? null,
      strongLocalCompetition: lead.strongLocalCompetition ?? false,
    },
    niche,
    s,
  );
  return {
    phoneE164: normalizePhone(lead.phone),
    nameNormalized: normalizeName(lead.name),
    score,
    scoreBreakdown: breakdown,
    scoreComputedAt: new Date(),
  };
}

export async function resolveNiche(db: Db, name: string) {
  const all = await db.select().from(niches);
  const n = normalizeName(name);
  return all.find((x) => normalizeName(x.name) === n) ?? null;
}

/** Região pelo label; cria se não existir (SPEC 6.2). */
export async function resolveRegion(db: Db, p: ParsedPlace, sourceSheetId?: string | null) {
  await db
    .insert(regions)
    .values({
      state: p.state,
      city: p.city,
      neighborhood: p.neighborhood,
      label: p.label,
      sourceSheetId: sourceSheetId ?? null,
    })
    .onConflictDoNothing({ target: regions.label });
  const [r] = await db.select().from(regions).where(eq(regions.label, p.label));
  return r!;
}

type Keys = {
  placeId?: string | null;
  phoneE164?: string | null;
  nameNormalized: string;
  regionId: number;
};

/** Duplicatas por place_id, telefone ou nome normalizado + região. */
export async function findDuplicates(db: Db, k: Keys, excludeId?: string) {
  const conds = [
    k.placeId ? eq(leads.placeId, k.placeId) : undefined,
    k.phoneE164 ? eq(leads.phoneE164, k.phoneE164) : undefined,
    and(eq(leads.nameNormalized, k.nameNormalized), eq(leads.regionId, k.regionId)),
  ].filter((c) => c !== undefined);
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      placeId: leads.placeId,
      phoneE164: leads.phoneE164,
      nameNormalized: leads.nameNormalized,
      regionId: leads.regionId,
      regionLabel: regions.label,
    })
    .from(leads)
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(and(or(...conds), excludeId ? sql`${leads.id} <> ${excludeId}` : undefined));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    regionLabel: r.regionLabel,
    reasons: [
      k.placeId && r.placeId === k.placeId && 'place_id',
      k.phoneE164 && r.phoneE164 === k.phoneE164 && 'telefone',
      r.nameNormalized === k.nameNormalized && r.regionId === k.regionId && 'nome + região',
    ].filter((x): x is string => !!x),
  }));
}

export async function isSuppressed(
  db: Db,
  l: {
    placeId?: string | null;
    phoneE164?: string | null;
    nameNormalized: string;
    regionLabel: string;
  },
) {
  const h = suppressionKeys(l);
  const conds = [
    l.placeId ? eq(suppressionList.placeId, l.placeId) : undefined,
    h.phoneE164Hash ? eq(suppressionList.phoneE164Hash, h.phoneE164Hash) : undefined,
    eq(suppressionList.nameRegionHash, h.nameRegionHash),
  ].filter((c) => c !== undefined);
  const [hit] = await db
    .select({ id: suppressionList.id })
    .from(suppressionList)
    .where(or(...conds))
    .limit(1);
  return !!hit;
}

export type CreateResult =
  | { ok: true; lead: Lead }
  | { ok: false; reason: 'duplicate'; duplicates: Awaited<ReturnType<typeof findDuplicates>> }
  | { ok: false; reason: 'suppressed' };

/** Cria o lead (score e normalizações calculados). Sem `force`, recusa duplicata e lead suprimido. */
export async function createLead(
  db: Db,
  input: { values: LeadValues & { name: string }; nicheId: number; regionId: number },
  opts: { force?: boolean } = {},
): Promise<CreateResult> {
  const [niche] = await db.select().from(niches).where(eq(niches.id, input.nicheId));
  const [region] = await db.select().from(regions).where(eq(regions.id, input.regionId));
  if (!niche || !region) throw new LeadError('NOT_FOUND', 'Nicho ou região inexistente');
  const settingsNow = await getScoreSettings(db);
  const derived = deriveFields(input.values, niche, settingsNow);
  const keys = { ...derived, placeId: input.values.placeId, regionId: region.id };
  if (await isSuppressed(db, { ...keys, regionLabel: region.label }))
    return { ok: false, reason: 'suppressed' };
  if (!opts.force) {
    const duplicates = await findDuplicates(db, keys);
    if (duplicates.length) return { ok: false, reason: 'duplicate', duplicates };
  }
  const [lead] = await db
    .insert(leads)
    .values({ ...input.values, ...derived, nicheId: niche.id, regionId: region.id })
    .returning();
  return { ok: true, lead: lead! };
}

export async function getLead(db: Db, id: string) {
  const [row] = await db
    .select({ lead: leads, niche: niches, region: regions })
    .from(leads)
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(eq(leads.id, id));
  return row ?? null;
}

/** Atualiza campos e recalcula derivados (score só muda se algo que conta mudou, mas é barato recalcular). */
export async function updateLead(
  db: Db,
  id: string,
  patch: LeadValues & { nicheId?: number; regionId?: number },
) {
  const cur = await getLead(db, id);
  if (!cur) throw new LeadError('NOT_FOUND', 'Lead não encontrado');
  const merged = { ...cur.lead, ...patch };
  const niche =
    patch.nicheId && patch.nicheId !== cur.niche.id
      ? (await db.select().from(niches).where(eq(niches.id, patch.nicheId)))[0]!
      : cur.niche;
  const derived = deriveFields(merged, niche, await getScoreSettings(db));
  const statusChanged = patch.contactStatus && patch.contactStatus !== cur.lead.contactStatus;
  const [lead] = await db
    .update(leads)
    .set({
      ...patch,
      ...derived,
      ...(statusChanged ? { contactStatusChangedAt: new Date() } : {}),
    })
    .where(eq(leads.id, id))
    .returning();
  return lead!;
}

/** SPEC 4.4: tudo numa transação. `optOut` grava também a suppression_list. */
export async function setDoNotContact(
  db: Db,
  id: string,
  input: { reason: string; optOut: boolean },
) {
  await db.transaction(async (tx) => {
    const cur = await getLead(tx, id);
    if (!cur) throw new LeadError('NOT_FOUND', 'Lead não encontrado');
    if (cur.lead.doNotContact) throw new LeadError('ALREADY_DNC', 'Lead já está como Não contatar');
    const now = new Date();
    // 1. lembretes abertos cancelados; os que têm evento no Calendar ficam pendentes de remoção
    await tx
      .update(reminders)
      .set({
        status: 'canceled',
        syncStatus: sql`case when ${reminders.googleEventId} is not null then 'pending'::sync_status else 'disabled'::sync_status end`,
      })
      .where(and(eq(reminders.leadId, id), eq(reminders.status, 'open')));
    // 2. negociações abertas vão para Perdido
    const [lost] = await tx.select().from(dealStages).where(eq(dealStages.key, 'lost'));
    const open = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.leadId, id), eq(deals.status, 'open')));
    for (const d of open) {
      await tx
        .update(deals)
        .set({
          stageId: lost!.id,
          status: 'lost',
          lostReason: 'Não contatar',
          lostAt: now,
          stageEnteredAt: now,
        })
        .where(eq(deals.id, d.id));
      await tx
        .insert(dealStageHistory)
        .values({ dealId: d.id, fromStageId: d.stageId, toStageId: lost!.id, source: 'ui' });
    }
    // 3 e 4. status e motivo
    await tx
      .update(leads)
      .set({
        contactStatus: 'discarded',
        contactStatusChangedAt: now,
        doNotContact: true,
        doNotContactReason: input.reason,
        doNotContactAt: now,
      })
      .where(eq(leads.id, id));
    await tx.insert(interactions).values({
      leadId: id,
      type: 'system',
      direction: 'internal',
      summary: 'Marcado como "Não contatar"',
      body: input.reason,
      createdBy: 'user',
    });
    // 5. suppression_list só para opt-out
    if (input.optOut) {
      await tx.insert(suppressionList).values({
        placeId: cur.lead.placeId,
        ...suppressionKeys({
          phoneE164: cur.lead.phoneE164,
          nameNormalized: cur.lead.nameNormalized ?? normalizeName(cur.lead.name),
          regionLabel: cur.region.label,
        }),
        reason: `opt_out: ${input.reason}`,
      });
    }
  });
}

/** Hard delete (SPEC 4.4). O usuário digita o nome; a cascata do banco leva deals, interações e lembretes. */
export async function deleteLead(db: Db, id: string, typedName: string) {
  await db.transaction(async (tx) => {
    const cur = await getLead(tx, id);
    if (!cur) throw new LeadError('NOT_FOUND', 'Lead não encontrado');
    if (typedName.trim() !== cur.lead.name.trim())
      throw new LeadError('NAME_MISMATCH', 'O nome digitado não confere');
    await tx.insert(suppressionList).values({
      placeId: cur.lead.placeId,
      ...suppressionKeys({
        phoneE164: cur.lead.phoneE164,
        nameNormalized: cur.lead.nameNormalized ?? normalizeName(cur.lead.name),
        regionLabel: cur.region.label,
      }),
      reason: 'deleted',
    });
    await tx.delete(leads).where(eq(leads.id, id));
  });
}

/** Recalcula o score de todos os leads, 500 por transação (usado quando os pesos mudam). */
export async function recomputeAllScores(db: Db, batchSize = 500) {
  const s = await getScoreSettings(db);
  let after: string | null = null;
  let changed = 0;
  for (;;) {
    const batch: { lead: Lead; niche: typeof niches.$inferSelect | null }[] = await db
      .select({ lead: leads, niche: niches })
      .from(leads)
      .leftJoin(niches, eq(niches.id, leads.nicheId))
      .where(after ? gt(leads.id, after) : undefined)
      .orderBy(asc(leads.id))
      .limit(batchSize);
    if (!batch.length) return changed;
    await db.transaction(async (tx) => {
      for (const { lead, niche } of batch) {
        const { score, breakdown } = computeScore(lead, niche, s);
        const stored = (lead.scoreBreakdown ?? {}) as Record<string, number>; // jsonb reordena as chaves
        if (score === lead.score && Object.entries(breakdown).every(([k, v]) => stored[k] === v))
          continue;
        await tx
          .update(leads)
          .set({ score, scoreBreakdown: breakdown, scoreComputedAt: new Date() })
          .where(eq(leads.id, lead.id));
        changed++;
      }
    });
    after = batch[batch.length - 1]!.lead.id;
  }
}

/** "Registrar como abordado": interação outbound, último contato agora e status → abordado (só se ainda não avançou). */
export async function registerApproach(
  db: Db,
  id: string,
  channel: 'whatsapp' | 'call' = 'whatsapp',
) {
  await db.transaction(async (tx) => {
    const cur = await getLead(tx, id);
    if (!cur) throw new LeadError('NOT_FOUND', 'Lead não encontrado');
    await tx.insert(interactions).values({
      leadId: id,
      type: channel,
      direction: 'outbound',
      summary: channel === 'whatsapp' ? 'Mensagem enviada por WhatsApp' : 'Ligação',
      createdBy: 'user',
    });
    const advance = ['new', 'to_contact'].includes(cur.lead.contactStatus);
    await tx
      .update(leads)
      .set({
        lastContactAt: new Date(),
        channel: channel === 'whatsapp' ? 'WhatsApp' : 'Ligação',
        ...(advance ? { contactStatus: 'contacted', contactStatusChangedAt: new Date() } : {}),
      })
      .where(eq(leads.id, id));
  });
}
