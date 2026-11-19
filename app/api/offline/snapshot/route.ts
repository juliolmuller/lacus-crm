import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { offlineSnapshot } from '@/lib/services/offline';

export const dynamic = 'force-dynamic';

/** JSON mínimo para o modo offline. `no-store` no HTTP: só o cache do service worker guarda isto. */
export async function GET() {
  try {
    await requireOwner();
  } catch {
    return new Response('Não autorizado', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(await offlineSnapshot(getDb()), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
