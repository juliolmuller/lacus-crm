import type { schema } from '@/lib/db';
import type { ReminderRow } from '@/lib/services/reminders';
import type { ReminderView } from './reminder-item';

/** Linha do banco → o que o componente de lembrete recebe (datas viram ISO). */
export const toReminderView = (
  r: typeof schema.reminders.$inferSelect,
  leadName: string,
  whatsapp: string | null = null,
  now = new Date(),
): ReminderView => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  dueAt: r.dueAt.toISOString(),
  status: r.status,
  overdue: r.status === 'open' && r.dueAt < now,
  source: r.source,
  syncStatus: r.syncStatus,
  syncError: r.syncError,
  leadId: r.leadId,
  leadName,
  whatsapp,
});

/** Linha das listas (join com o lead) → o que o componente de lembrete recebe. */
export const rowToView = (r: ReminderRow, now: Date, whatsapp: string | null): ReminderView => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  dueAt: r.dueAt.toISOString(),
  status: r.status,
  overdue: r.status === 'open' && r.dueAt < now,
  source: r.source,
  syncStatus: r.syncStatus,
  syncError: r.syncError,
  leadId: r.leadId,
  leadName: r.leadName,
  whatsapp,
});
