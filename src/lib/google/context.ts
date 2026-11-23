import 'server-only';
import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { syncReminders, type SyncContext } from '@/lib/services/calendar-sync';
import { realDeps } from './oauth';

export const syncContext = (): SyncContext => ({
  deps: realDeps(),
  keys: { v1: getEnv().TOKEN_ENCRYPTION_KEY },
  appUrl: getEnv().NEXT_PUBLIC_APP_URL,
});

/** Outbox: depois da resposta, tenta sincronizar o que ficou `pending` (SPEC 10). Só em request. */
export const syncAfterResponse = () =>
  after(async () => {
    try {
      await syncReminders(getDb(), syncContext(), { mode: 'after' });
    } catch (e) {
      console.error('sync do Calendar falhou', e);
    }
  });

/**
 * Escritas por MCP e REST: a UI sincroniza ao fim da resposta (`syncAfterResponse`); sem isto o
 * lembrete ficaria `pending` até o próximo job horário. Falha aqui nunca derruba a ferramenta.
 */
export function syncAfterWrite(scopes: readonly string[]) {
  if (!scopes.includes('write')) return;
  try {
    syncAfterResponse();
  } catch (e) {
    console.error('sync do Calendar não agendado', e);
  }
}
