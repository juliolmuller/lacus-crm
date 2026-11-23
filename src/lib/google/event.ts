import { whatsappUrl } from '@/lib/leads/links';

import { type CalendarEvent } from './calendar-api';

const TZ = 'America/Sao_Paulo';

/**
 * Mapeamento lembrete → evento (SPEC 10).
 */
export function buildEvent(
  r: {
    dueAt: Date;
    durationMin: number;
    id: string;
    leadId: string;
    notes: null | string;
    title: string;
  },
  lead: { name: string; nextAction: null | string; phoneE164: null | string },
  opts: { appUrl: string; popupMinutes: number[] },
): CalendarEvent {
  const wa = whatsappUrl(lead.phoneE164);
  const description = [
    lead.nextAction && `Próxima ação: ${lead.nextAction}`,
    lead.phoneE164 && `Telefone: ${lead.phoneE164}`,
    wa && `WhatsApp: ${wa}`,
    `Lead: ${opts.appUrl}/leads/${r.leadId}`,
    r.notes && `Notas: ${r.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    summary: `Follow-up: ${lead.name} – ${r.title}`,
    description,
    start: { dateTime: r.dueAt.toISOString(), timeZone: TZ },
    end: {
      dateTime: new Date(r.dueAt.getTime() + r.durationMin * 60_000).toISOString(),
      timeZone: TZ,
    },
    reminders: {
      useDefault: false,
      overrides: opts.popupMinutes.map((minutes) => ({ method: 'popup', minutes })),
    },
    extendedProperties: { private: { crmReminderId: r.id, crmLeadId: r.leadId } },
  };
}
