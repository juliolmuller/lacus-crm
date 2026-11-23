import { type KeyRing } from '@/lib/crypto';
import { type GoogleDeps } from '@/lib/google/calendar-api';

type Ev = { id: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- corpo livre do mock

/**
 * Calendar v3 em memória: o suficiente para insert/update/delete/list por
 * propriedade privada.
 */
export function fakeGoogle(opts: { failRefresh?: boolean } = {}): {
  calls: string[];
  deps: GoogleDeps;
  events: Map<string, Ev>;
} {
  const events = new Map<string, Ev>();
  const calls: string[] = [];
  let seq = 0;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });
  const deps: GoogleDeps = {
    async refresh() {
      if (opts.failRefresh)
        throw Object.assign(new Error('invalid_grant'), {
          response: { data: { error: 'invalid_grant' } },
        });

      return { accessToken: 'at-new', expiresAt: new Date(Date.now() + 3_600_000) };
    },
    async fetch(input, init) {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace('/calendar/v3', '');

      calls.push(`${method} ${path}`);

      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (method === 'POST' && path === '/calendars') return json({ id: 'cal-1' });

      if (method === 'GET' && path.startsWith('/calendars/') && !path.includes('/events'))
        return json({ id: 'cal-1' });

      const m = path.match(/^\/calendars\/[^/]+\/events(?:\/(.+))?$/);

      if (!m) return json({}, 404);

      const id = m[1];

      if (method === 'POST') {
        const ev = { ...body, id: `ev-${++seq}` };

        events.set(ev.id, ev);

        return json(ev);
      }

      if (method === 'PUT') {
        if (!id || !events.has(id)) return json({ error: 'not found' }, 404);

        events.set(id, { ...body, id });

        return json({ id });
      }

      if (method === 'DELETE') {
        if (!id || !events.has(id)) return json({ error: 'gone' }, 410);

        events.delete(id);

        return new Response(null, { status: 204 });
      }

      const want = url.searchParams.get('privateExtendedProperty')?.split('=')[1];

      return json({
        items: [...events.values()].filter(
          (e) => e.extendedProperties?.private?.crmReminderId === want,
        ),
      });
    },
  };

  return { deps, events, calls };
}

export const keys: KeyRing = { v1: 'k'.repeat(32) };
