'use server';

import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb, schema } from '@/lib/db';
import { safeUrl } from '@/lib/leads/links';
import { contactStatuses } from '@/lib/leads/labels';
import { parseFilters } from '@/lib/leads/filters-server';
import { logInteraction } from '@/lib/services/interactions';
import { prepareLeadInput } from '@/lib/services/lead-form';
import { listLeads } from '@/lib/services/lead-list';
import {
  changedFields,
  createLead,
  deleteLead,
  getLead,
  setDoNotContact,
  updateLead,
} from '@/lib/services/leads';

const toFilters = (qs: string) => parseFilters(Object.fromEntries(new URLSearchParams(qs)));
const toRow = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<
    string,
    string
  >;

/** Próxima página da tabela (mesmos filtros da URL). */
export async function loadMoreLeads(qs: string, cursor: string) {
  await requireOwner();
  return listLeads(getDb(), toFilters(qs), cursor);
}

const inlineSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('contactStatus'), value: z.enum(contactStatuses) }),
  z.object({ field: z.literal('nextAction'), value: z.string().trim().max(300) }),
  z.object({ field: z.literal('priority'), value: z.number().int().min(0).max(999).nullable() }),
]);

/** Edição inline: Status, Próxima ação e Prioridade. */
export async function updateInline(id: string, input: unknown): Promise<Result> {
  await requireOwner();
  const p = inlineSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Valor inválido' };
  try {
    const v = p.data.field === 'nextAction' ? p.data.value || null : p.data.value;
    await updateLead(getDb(), id, { [p.data.field]: v });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createLeadAction(
  fd: FormData,
  force = false,
): Promise<
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      duplicates?: { id: string; name: string; regionLabel: string; reasons: string[] }[];
    }
> {
  await requireOwner();
  const db = getDb();
  try {
    const input = await prepareLeadInput(db, toRow(fd));
    if (!input.ok) return input;
    if (!input.values.name || !input.nicheId || !input.regionId)
      return { ok: false, error: 'Nome, nicho e "Cidade / bairro" são obrigatórios' };
    const r = await createLead(
      db,
      {
        values: { ...input.values, name: input.values.name, dataSource: 'manual' },
        nicheId: input.nicheId,
        regionId: input.regionId,
      },
      { force },
    );
    if (r.ok) {
      return { ok: true, id: r.lead.id };
    }
    return r.reason === 'suppressed'
      ? { ok: false, error: 'Este lead está na lista de supressão (excluído ou opt-out).' }
      : { ok: false, error: 'Já existe um lead parecido.', duplicates: r.duplicates };
  } catch (e) {
    return fail(e);
  }
}

/** Aba Dados: grava só o que mudou. */
export async function updateLeadAction(id: string, fd: FormData): Promise<Result> {
  await requireOwner();
  const db = getDb();
  try {
    const cur = await getLead(db, id);
    if (!cur) return { ok: false, error: 'Lead não encontrado' };
    const input = await prepareLeadInput(db, toRow(fd));
    if (!input.ok) return input;
    const patch = {
      ...input.values,
      ...(input.nicheId ? { nicheId: input.nicheId } : {}),
      ...(input.regionId ? { regionId: input.regionId } : {}),
    };
    if ('name' in patch && !patch.name) return { ok: false, error: 'O nome é obrigatório' };
    const keys = changedFields(cur.lead, patch);
    if (keys.length)
      await updateLead(
        db,
        id,
        Object.fromEntries(keys.map((k) => [k, (patch as Record<string, unknown>)[k]])),
      );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setSessionUrl(id: string, url: string): Promise<Result> {
  await requireOwner();
  const clean = url.trim() ? safeUrl(url) : null;
  if (url.trim() && !clean) return { ok: false, error: 'Informe uma URL http(s) válida' };
  try {
    await updateLead(getDb(), id, { sessionUrl: clean });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markDoNotContact(
  id: string,
  reason: string,
  optOut: boolean,
): Promise<Result> {
  await requireOwner();
  if (reason.trim().length < 3) return { ok: false, error: 'Informe o motivo' };
  try {
    await setDoNotContact(getDb(), id, { reason: reason.trim(), optOut });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLeadAction(id: string, typedName: string): Promise<Result> {
  await requireOwner();
  try {
    await deleteLead(getDb(), id, typedName);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function registerApproachAction(id: string): Promise<Result> {
  await requireOwner();
  try {
    await logInteraction(getDb(), {
      leadId: id,
      type: 'whatsapp',
      direction: 'outbound',
      summary: 'Mensagem enviada por WhatsApp',
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const { savedViews } = schema;

export async function saveView(name: string, qs: string): Promise<Result> {
  await requireOwner();
  const n = name.trim();
  if (!n || n.length > 40) return { ok: false, error: 'Dê um nome de até 40 caracteres' };
  const db = getDb();
  const last = await db
    .select({ sort: savedViews.sort })
    .from(savedViews)
    .where(eq(savedViews.scope, 'leads'))
    .orderBy(asc(savedViews.sort));
  await db
    .insert(savedViews)
    .values({ scope: 'leads', name: n, params: { qs }, sort: (last.at(-1)?.sort ?? 0) + 1 });
  return { ok: true };
}

export async function deleteView(id: number): Promise<Result> {
  await requireOwner();
  await getDb()
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.scope, 'leads')));
  return { ok: true };
}
