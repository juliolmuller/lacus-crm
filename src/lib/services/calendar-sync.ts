import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';

import { decrypt, encrypt, type KeyRing } from '@/lib/crypto';
import { type Db, schema } from '@/lib/db';
import { backoffMinutes } from '@/lib/followups/snooze';
import {
  calendarApi,
  type CalendarApi,
  GoogleApiError,
  type GoogleDeps,
  isInvalidGrant,
} from '@/lib/google/calendar-api';
import { buildEvent } from '@/lib/google/event';
import { parseSetting, settingDefaults } from '@/lib/validation/settings';

const { reminders, leads, googleConnections, settings } = schema;

export const CALENDAR_NAME = 'Lacus CRM – Follow-ups';
const TZ = 'America/Sao_Paulo';

export interface SyncContext {
  appUrl: string;
  deps: GoogleDeps;
  keys: KeyRing;
}
export interface SyncStats {
  deleted: number;
  errors: number;
  skipped?: 'needs_reauth' | 'no_connection';
  synced: number;
}

class NeedsReauth extends Error {}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function getConnection(db: Db) {
  const [c] = await db.select().from(googleConnections).limit(1);

  return c;
}

/**
 * Access token válido (renova pelo refresh token se faltar menos de 1 min) e
 * função que o grava.
 */
function tokenSource(db: Db, ctx: SyncContext, conn: typeof googleConnections.$inferSelect) {
  let access =
    conn.accessTokenEnc && conn.accessTokenExpiresAt
      ? { token: decrypt(conn.accessTokenEnc, ctx.keys), expiresAt: conn.accessTokenExpiresAt }
      : null;

  return async (force = false): Promise<string> => {
    if (!force && access && access.expiresAt.getTime() - Date.now() > 60_000) return access.token;

    try {
      const fresh = await ctx.deps.refresh(decrypt(conn.refreshTokenEnc, ctx.keys));
      access = { token: fresh.accessToken, expiresAt: fresh.expiresAt };
      await db
        .update(googleConnections)
        .set({
          accessTokenEnc: encrypt(fresh.accessToken, ctx.keys),
          accessTokenExpiresAt: fresh.expiresAt,
        })
        .where(eq(googleConnections.id, conn.id));

      return fresh.accessToken;
    } catch (e) {
      if (isInvalidGrant(e)) throw new NeedsReauth();

      throw e;
    }
  };
}

async function popupMinutes(db: Db): Promise<number[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'calendar_defaults'));

  return parseSetting('calendar_defaults', row?.value ?? settingDefaults.calendar_defaults)
    .popupReminderMinutes;
}

/**
 * Invalid_grant: banner de reconexão e os lembretes com erro voltam a pendente.
 */
async function markNeedsReauth(db: Db, connId: number): Promise<void> {
  await db
    .update(googleConnections)
    .set({ status: 'needs_reauth', lastError: 'invalid_grant: reconecte o Google Calendar' })
    .where(eq(googleConnections.id, connId));
  await db
    .update(reminders)
    .set({ syncStatus: 'pending' })
    .where(eq(reminders.syncStatus, 'error'));
}

const isGone = (e: unknown): boolean =>
  e instanceof GoogleApiError && (e.status === 404 || e.status === 410);

/**
 * Outbox (SPEC 10): sincroniza lembretes `pending`/`error` com o Calendar
 * dedicado. Aberto → cria/atualiza o evento; concluído ou cancelado → apaga.
 * `after` respeita o backoff (1, 5, 30 min); `job` tenta tudo. `reconcile`
 * procura o evento por `crmReminderId` antes de criar (re-sincronizar).
 */
export async function syncReminders(
  db: Db,
  ctx: SyncContext,
  opts: { mode: 'after' | 'job'; now?: Date; reconcile?: boolean } = { mode: 'after' },
): Promise<SyncStats> {
  const stats: SyncStats = { synced: 0, deleted: 0, errors: 0 };
  const conn = await getConnection(db);

  if (!conn || conn.status === 'revoked') {
    await db
      .update(reminders)
      .set({ syncStatus: 'disabled' })
      .where(inArray(reminders.syncStatus, ['pending', 'error']));

    return { ...stats, skipped: 'no_connection' };
  }

  if (conn.status === 'needs_reauth' || !conn.calendarId)
    return { ...stats, skipped: 'needs_reauth' };

  const now = opts.now ?? new Date();
  const candidates = await db
    .select({
      id: reminders.id,
      status: reminders.syncStatus,
      attempts: reminders.syncAttempts,
      at: reminders.updatedAt,
    })
    .from(reminders)
    .where(inArray(reminders.syncStatus, ['pending', 'error']))
    .orderBy(reminders.updatedAt)
    .limit(opts.mode === 'job' ? 200 : 50);
  const ids = candidates
    .filter((c) => {
      if (opts.mode === 'job' || c.status === 'pending') return true;

      const wait = backoffMinutes(c.attempts);

      return wait !== null && now.getTime() - c.at.getTime() >= wait * 60_000;
    })
    .map((c) => c.id);

  if (!ids.length) return stats;

  const api = calendarApi(ctx.deps, tokenSource(db, ctx, conn));
  const popup = await popupMinutes(db);
  const calendarId = conn.calendarId;

  for (const id of ids) {
    try {
      const outcome = await db.transaction((tx) =>
        syncOne(
          tx,
          { api, calendarId, popup, appUrl: ctx.appUrl, reconcile: !!opts.reconcile },
          id,
        ),
      );

      if (outcome === 'synced') stats.synced++;

      if (outcome === 'deleted') stats.deleted++;
    } catch (e) {
      if (e instanceof NeedsReauth) {
        await markNeedsReauth(db, conn.id);

        return { ...stats, skipped: 'needs_reauth' };
      }

      stats.errors++;
      await db
        .update(reminders)
        .set({
          syncStatus: 'error',
          syncAttempts: sql`${reminders.syncAttempts} + 1`,
          syncError: message(e),
        })
        .where(eq(reminders.id, id));
    }
  }

  if (conn.lastError && !stats.errors)
    await db
      .update(googleConnections)
      .set({ lastError: null })
      .where(eq(googleConnections.id, conn.id));

  return stats;
}

interface One {
  api: CalendarApi;
  appUrl: string;
  calendarId: string;
  popup: number[];
  reconcile: boolean;
}

async function syncOne(tx: Db, o: One, id: string): Promise<'deleted' | 'skipped' | 'synced'> {
  const [row] = await tx
    .select({ r: reminders, lead: leads })
    .from(reminders)
    .innerJoin(leads, eq(leads.id, reminders.leadId))
    .where(eq(reminders.id, id))
    .for('update', { of: reminders, skipLocked: true });

  if (!row || !['pending', 'error'].includes(row.r.syncStatus)) return 'skipped'; // outro processo já cuidou

  const { r, lead } = row;
  const known = r.googleEventId && r.googleCalendarId === o.calendarId ? r.googleEventId : null;
  const done = (patch: Partial<typeof reminders.$inferInsert>) =>
    tx
      .update(reminders)
      .set({
        syncStatus: 'synced',
        syncAttempts: 0,
        syncError: null,
        syncedAt: new Date(),
        ...patch,
      })
      .where(eq(reminders.id, id));

  if (r.status !== 'open') {
    if (!known) {
      await done({ googleEventId: null });

      return 'skipped';
    }

    try {
      await o.api.remove(o.calendarId, known);
    } catch (e) {
      if (!isGone(e)) throw e;
    }

    await done({ googleEventId: null });

    return 'deleted';
  }

  const event = buildEvent(r, lead, { appUrl: o.appUrl, popupMinutes: o.popup });
  let eventId = known;

  if (eventId) {
    try {
      await o.api.update(o.calendarId, eventId, event);
    } catch (e) {
      if (!isGone(e)) throw e;

      eventId = null; // apagado no Google: recria (SPEC 10)
    }
  }

  if (!eventId && o.reconcile) {
    const [first, ...extras] = await o.api.findByReminder(o.calendarId, r.id);
    for (const x of extras)
      await o.api.remove(o.calendarId, x.id).catch((e) => {
        if (!isGone(e)) throw e;
      });

    if (first) {
      await o.api.update(o.calendarId, first.id, event);
      eventId = first.id;
    }
  }

  if (!eventId) eventId = (await o.api.insert(o.calendarId, event)).id;

  await done({ googleEventId: eventId, googleCalendarId: o.calendarId });

  return 'synced';
}

/**
 * Conecta (ou reconecta): reaproveita o calendário já guardado, senão cria;
 * religa os lembretes.
 */
export async function connectGoogle(
  db: Db,
  ctx: SyncContext,
  g: { accessToken: string; email: string; expiresAt: Date; refreshToken: string; scope: string },
): Promise<string> {
  const existing = await getConnection(db);
  const api = calendarApi(ctx.deps, async () => g.accessToken);
  let calendarId: null | string = null;

  if (existing?.calendarId)
    calendarId = (await api.getCalendar(existing.calendarId).catch(() => null))?.id ?? null;

  // com `calendar.app.created` não dá para listar calendários: sem o id guardado, cria um novo
  calendarId ??= (await api.createCalendar(CALENDAR_NAME, TZ)).id;

  const values = {
    googleEmail: g.email,
    refreshTokenEnc: encrypt(g.refreshToken, ctx.keys),
    accessTokenEnc: encrypt(g.accessToken, ctx.keys),
    accessTokenExpiresAt: g.expiresAt,
    scope: g.scope,
    calendarId,
    status: 'active' as const,
    lastError: null,
    connectedAt: new Date(),
  };

  if (existing)
    await db.update(googleConnections).set(values).where(eq(googleConnections.id, existing.id));
  else await db.insert(googleConnections).values(values);

  await queueAll(db);

  return calendarId;
}

/**
 * Lembretes abertos sem evento e encerrados que ainda têm evento voltam para a
 * fila.
 */
async function queueAll(db: Db): Promise<void> {
  await db
    .update(reminders)
    .set({ syncStatus: 'pending', syncAttempts: 0, syncError: null })
    .where(
      or(
        eq(reminders.status, 'open'),
        and(ne(reminders.status, 'open'), isNotNull(reminders.googleEventId)),
      ),
    );
}

export async function disconnectGoogle(
  db: Db,
  revoke: (token: string) => Promise<unknown>,
  keys: KeyRing,
): Promise<void> {
  const conn = await getConnection(db);

  if (!conn) return;

  if (conn.status !== 'revoked')
    await revoke(decrypt(conn.refreshTokenEnc, keys)).catch(() => undefined); // melhor esforço

  // mantém a linha (e o calendar_id) para reaproveitar o calendário ao reconectar
  await db
    .update(googleConnections)
    .set({
      status: 'revoked',
      refreshTokenEnc: '',
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      lastError: null,
    })
    .where(eq(googleConnections.id, conn.id));
  await db
    .update(reminders)
    .set({ syncStatus: 'disabled' })
    .where(inArray(reminders.syncStatus, ['pending', 'error', 'synced']));
}

/**
 * "Re-sincronizar tudo": reconcilia cada lembrete com o Calendar por
 * `crmReminderId`.
 */
export async function resyncAll(db: Db, ctx: SyncContext): Promise<SyncStats> {
  await queueAll(db);

  return syncReminders(db, ctx, { mode: 'job', reconcile: true });
}

/**
 * Painel de status do Calendar: conexão, erros e pendências.
 */
export async function syncOverview(db: Db) {
  const conn = await getConnection(db);
  const [c] = await db
    .select({
      errors: sql<number>`count(*) filter (where ${reminders.syncStatus} = 'error')`,
      pending: sql<number>`count(*) filter (where ${reminders.syncStatus} = 'pending')`,
    })
    .from(reminders);

  return {
    status: conn?.status ?? null,
    email: conn?.status && conn.status !== 'revoked' ? conn.googleEmail : null,
    calendarId: conn?.calendarId ?? null,
    lastError: conn?.lastError ?? null,
    errors: Number(c?.errors ?? 0),
    pending: Number(c?.pending ?? 0),
  };
}

/**
 * Ids de eventos do Calendar de um lead (guardados antes de excluí-lo, que
 * apaga os lembretes).
 */
export async function leadEventIds(db: Db, leadId: string): Promise<string[]> {
  const rows = await db
    .select({ id: reminders.googleEventId })
    .from(reminders)
    .where(and(eq(reminders.leadId, leadId), isNotNull(reminders.googleEventId)));

  return rows.flatMap((r) => (r.id ? [r.id] : []));
}

/**
 * Apaga eventos órfãos (lead excluído). Melhor esforço: 404/410 contam como
 * feito.
 */
export async function purgeEvents(db: Db, ctx: SyncContext, eventIds: string[]): Promise<void> {
  const conn = await getConnection(db);

  if (!conn || conn.status !== 'active' || !conn.calendarId || !eventIds.length) return;

  const api = calendarApi(ctx.deps, tokenSource(db, ctx, conn));
  for (const id of eventIds)
    await api.remove(conn.calendarId, id).catch((e) => {
      if (!isGone(e)) throw e;
    });
}
