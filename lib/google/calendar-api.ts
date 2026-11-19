// Calendar v3 por fetch (sem `googleapis`). Só os cinco endpoints que o CRM usa.
const BASE = 'https://www.googleapis.com/calendar/v3';

export type GoogleDeps = {
  fetch: typeof fetch;
  /** troca o refresh token por um access token novo; lança `invalid_grant` se revogado/expirado */
  refresh: (refreshToken: string) => Promise<{ accessToken: string; expiresAt: Date }>;
};

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Erro de refresh que exige reconectar (SPEC 10). */
export const isInvalidGrant = (e: unknown) => {
  const x = e as { message?: string; response?: { data?: { error?: string } } };
  return x?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(x?.message ?? '');
};

export type CalendarEvent = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] };
  extendedProperties: { private: { crmReminderId: string; crmLeadId: string } };
};

export function calendarApi(
  deps: Pick<GoogleDeps, 'fetch'>,
  getToken: (force?: boolean) => Promise<string>,
) {
  async function call(
    method: string,
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<unknown> {
    const res = await deps.fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken(!retry)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) return call(method, path, body, false); // token vencido: renova uma vez
    if (!res.ok)
      throw new GoogleApiError(
        res.status,
        `Google Calendar ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    return res.status === 204 ? null : res.json();
  }
  const ev = (cal: string, id?: string) =>
    `/calendars/${encodeURIComponent(cal)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  return {
    createCalendar: (summary: string, timeZone: string) =>
      call('POST', '/calendars', { summary, timeZone }) as Promise<{ id: string }>,
    getCalendar: (cal: string) =>
      call('GET', `/calendars/${encodeURIComponent(cal)}`) as Promise<{ id: string }>,
    insert: (cal: string, e: CalendarEvent) => call('POST', ev(cal), e) as Promise<{ id: string }>,
    update: (cal: string, id: string, e: CalendarEvent) =>
      call('PUT', ev(cal, id), e) as Promise<{ id: string }>,
    remove: (cal: string, id: string) => call('DELETE', ev(cal, id)),
    /** eventos com `extendedProperties.private.crmReminderId = reminderId` */
    findByReminder: async (cal: string, reminderId: string) =>
      (
        (await call(
          'GET',
          `${ev(cal)}?${new URLSearchParams({ privateExtendedProperty: `crmReminderId=${reminderId}`, maxResults: '10' })}`,
        )) as { items?: { id: string }[] }
      ).items ?? [],
  };
}
export type CalendarApi = ReturnType<typeof calendarApi>;
