// Calendar v3 por fetch (sem `googleapis`). Só os cinco endpoints que o CRM usa.
const BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleDeps {
  fetch: typeof fetch;
  /**
   * Troca o refresh token por um access token novo; lança `invalid_grant` se
   * revogado/expirado.
   */
  refresh: (refreshToken: string) => Promise<{ accessToken: string; expiresAt: Date }>;
}

export class GoogleApiError extends Error {
  public constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Erro de refresh que exige reconectar (SPEC 10).
 */
export const isInvalidGrant = (e: unknown): boolean => {
  const x = e as { message?: string; response?: { data?: { error?: string } } };

  return x?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(x?.message ?? '');
};

export interface CalendarEvent {
  description: string;
  end: { dateTime: string; timeZone: string };
  extendedProperties: { private: { crmLeadId: string; crmReminderId: string } };
  reminders: { overrides: Array<{ method: 'popup'; minutes: number }>; useDefault: false };
  start: { dateTime: string; timeZone: string };
  summary: string;
}

export interface CalendarApi {
  createCalendar: (summary: string, timeZone: string) => Promise<{ id: string }>;
  /**
   * Eventos com `extendedProperties.private.crmReminderId = reminderId`
   */
  findByReminder: (cal: string, reminderId: string) => Promise<Array<{ id: string }>>;
  getCalendar: (cal: string) => Promise<{ id: string }>;
  insert: (cal: string, e: CalendarEvent) => Promise<{ id: string }>;
  remove: (cal: string, id: string) => Promise<unknown>;
  update: (cal: string, id: string, e: CalendarEvent) => Promise<{ id: string }>;
}

export function calendarApi(
  deps: Pick<GoogleDeps, 'fetch'>,
  getToken: (force?: boolean) => Promise<string>,
): CalendarApi {
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
  const ev = (cal: string, id?: string): string =>
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
    /**
     * Eventos com `extendedProperties.private.crmReminderId = reminderId`
     */
    findByReminder: async (cal: string, reminderId: string) =>
      (
        (await call(
          'GET',
          `${ev(cal)}?${new URLSearchParams({ privateExtendedProperty: `crmReminderId=${reminderId}`, maxResults: '10' })}`,
        )) as { items?: Array<{ id: string }> }
      ).items ?? [],
  };
}
