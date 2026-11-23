import { beforeEach, describe, expect, it, vi } from 'vitest';

const queued: Array<() => Promise<void>> = [];
const syncReminders = vi.fn().mockResolvedValue({});
let afterThrows = false;

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    if (afterThrows) throw new Error('after fora do escopo de request');
    queued.push(fn);
  },
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ TOKEN_ENCRYPTION_KEY: 'k', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }),
}));
vi.mock('@/lib/google/oauth', () => ({ realDeps: () => ({}) }));
vi.mock('@/lib/services/calendar-sync', () => ({ syncReminders }));

const { syncAfterWrite } = await import('@/lib/google/context');

describe('syncAfterWrite', () => {
  beforeEach(() => {
    queued.length = 0;
    syncReminders.mockClear();
    afterThrows = false;
  });

  it('agenda o sync do Calendar depois de uma escrita', async () => {
    syncAfterWrite(['write']);
    expect(queued).toHaveLength(1);
    await queued[0]!();
    expect(syncReminders).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      mode: 'after',
    });
  });

  it('não agenda nada em operações só de leitura ou só de prospecção', () => {
    syncAfterWrite(['read']);
    syncAfterWrite(['prospecting']);
    expect(queued).toHaveLength(0);
  });

  it('não derruba a ferramenta se `after` falhar', () => {
    afterThrows = true;
    expect(() => syncAfterWrite(['write', 'prospecting'])).not.toThrow();
  });
});
