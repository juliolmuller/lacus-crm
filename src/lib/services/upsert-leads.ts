import { and, eq } from 'drizzle-orm';

import { type Db, schema } from '@/lib/db';
import { normalizeName, normalizePhone, parseCityNeighborhood } from '@/lib/normalize';
import { type LeadInput, type UpsertInput } from '@/lib/validation/upsert';

import { audit } from './audit';
import {
  changedFields,
  deriveFields,
  getScoreSettings,
  isSuppressed,
  type LeadValues,
  resolveNiche,
  resolveRegion,
} from './leads';

const { leads } = schema;

export class UpsertError extends Error {
  public constructor(
    public code: 'UNKNOWN_NICHE',
    message: string,
  ) {
    super(message);
  }
}

export type SkipReason =
  'do_not_contact' | 'duplicate_name' | 'duplicate_phone' | 'invalid_region' | 'suppressed';

export interface UpsertResult {
  created: Array<{ id: string; ref: string }>;
  skipped: Array<{ reason: SkipReason; ref: string }>;
  updated: Array<{ changed: string[]; id: string; ref: string }>;
}

const rating = (n: number | undefined): string | undefined =>
  n === undefined ? undefined : n.toFixed(1);

/**
 * SPEC 9.2: normaliza → supressão → casa (place_id, telefone, nome + região) →
 * atualiza só campos de máquina ou insere. Tudo numa transação, com
 * `audit_log`. Repetir a chamada não muda o estado.
 */
export async function upsertLeads(
  db: Db,
  input: UpsertInput,
  actor: string,
): Promise<UpsertResult> {
  const out: UpsertResult = { created: [], updated: [], skipped: [] };

  return db.transaction(async (tx) => {
    const scoreSettings = await getScoreSettings(tx);
    // nicho inexistente é erro do lote inteiro: nada é gravado
    const nicheOf = new Map<string, typeof schema.niches.$inferSelect>();
    for (const l of input.leads) {
      const n = await resolveNiche(tx, l.nicheName);

      if (!n) throw new UpsertError('UNKNOWN_NICHE', `Nicho inexistente: "${l.nicheName}"`);

      nicheOf.set(l.nicheName, n);
    }
    for (const l of input.leads) {
      const ref = l.placeId ?? l.name;
      const place = parseCityNeighborhood(l.regionLabel);

      if (!place) {
        out.skipped.push({ ref, reason: 'invalid_region' });
        continue;
      }

      const niche = nicheOf.get(l.nicheName)!;
      const phoneE164 = normalizePhone(l.phone);
      const nameNormalized = normalizeName(l.name);
      const region = await resolveRegion(tx, place);

      if (
        await isSuppressed(tx, {
          placeId: l.placeId,
          phoneE164,
          nameNormalized,
          regionLabel: region.label,
        })
      ) {
        out.skipped.push({ ref, reason: 'suppressed' });
        continue;
      }

      const byPlace = l.placeId
        ? (await tx.select().from(leads).where(eq(leads.placeId, l.placeId)))[0]
        : undefined;
      const byPhone =
        !byPlace && phoneE164
          ? (await tx.select().from(leads).where(eq(leads.phoneE164, phoneE164)))[0]
          : undefined;
      const byName =
        !byPlace && !byPhone
          ? (
              await tx
                .select()
                .from(leads)
                .where(and(eq(leads.nameNormalized, nameNormalized), eq(leads.regionId, region.id)))
            )[0]
          : undefined;
      const cur = byPlace ?? byPhone ?? byName;

      if (cur) {
        // outro place_id no mesmo telefone/nome: é outro estabelecimento, não atualiza
        if (!byPlace && l.placeId && cur.placeId && cur.placeId !== l.placeId) {
          out.skipped.push({ ref, reason: byPhone ? 'duplicate_phone' : 'duplicate_name' });
          continue;
        }

        if (cur.doNotContact) {
          out.skipped.push({ ref, reason: 'do_not_contact' });
          continue;
        }

        const patch = machinePatch(cur, l);
        const changed = changedFields(cur, patch);

        if (changed.length) {
          const derived = deriveFields({ ...cur, ...patch }, niche, scoreSettings);

          await tx
            .update(leads)
            .set({ ...patch, ...derived })
            .where(eq(leads.id, cur.id));
          await audit(tx, {
            entity: 'lead',
            entityId: cur.id,
            action: 'upsert_update',
            actor,
            diff: { runId: input.runId, queuePosition: input.queuePosition, fields: changed },
          });
        }

        out.updated.push({ ref, id: cur.id, changed });
        continue;
      }

      const values: { name: string } & LeadValues = {
        name: l.name,
        placeId: l.placeId,
        phone: l.phone,
        address: l.address,
        mapsRating: rating(l.mapsRating),
        mapsReviews: l.mapsReviews,
        mapsUrl: l.mapsUrl,
        mapsCategory: l.mapsCategory,
        digitalSignals: l.digitalSignals,
        websiteUrl: l.websiteUrl,
        websiteStatus: l.websiteStatus,
        instagram: l.instagram,
        businessSummary: l.businessSummary,
        pitch: l.pitch,
        hasWhatsapp: l.hasWhatsapp,
        hasActiveAds: l.hasActiveAds,
        instagramActive: l.instagramActive,
      };
      const [row] = await tx
        .insert(leads)
        .values({
          ...(l.id ? { id: l.id } : {}),
          ...values,
          ...deriveFields(values, niche, scoreSettings),
          nicheId: niche.id,
          regionId: region.id,
          dataSource: 'google_places',
        })
        .returning({ id: leads.id });

      await audit(tx, {
        entity: 'lead',
        entityId: row!.id,
        action: 'upsert_create',
        actor,
        diff: { runId: input.runId, queuePosition: input.queuePosition },
      });
      out.created.push({ ref, id: row!.id });
    }

    return out;
  });
}

/**
 * Só campos de máquina (SPEC 9.2.4): nunca status, notas, próxima ação,
 * prioridade, sessão, DNC...
 */
function machinePatch(cur: typeof leads.$inferSelect, l: LeadInput): LeadValues {
  const p: LeadValues = {};

  // sempre atualiza (quando a rotina mandou o valor)
  if (l.mapsRating !== undefined) p.mapsRating = rating(l.mapsRating);

  if (l.mapsReviews !== undefined) p.mapsReviews = l.mapsReviews;

  if (l.mapsUrl !== undefined) p.mapsUrl = l.mapsUrl;

  if (l.address !== undefined) p.address = l.address;

  if (l.mapsCategory !== undefined) p.mapsCategory = l.mapsCategory;

  if (l.digitalSignals !== undefined) p.digitalSignals = l.digitalSignals;

  // preenche se vazio
  if (l.websiteUrl && !cur.websiteUrl) p.websiteUrl = l.websiteUrl;

  if (l.instagram && !cur.instagram) p.instagram = l.instagram;

  if (l.businessSummary && !cur.businessSummary) p.businessSummary = l.businessSummary;

  if (l.pitch && !cur.pitch) p.pitch = l.pitch;

  if (l.placeId && !cur.placeId) p.placeId = l.placeId;

  // só enquanto o status do site ainda é desconhecido
  if (l.websiteStatus && cur.websiteStatus === 'unknown') p.websiteStatus = l.websiteStatus;

  return p;
}
