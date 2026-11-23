import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { timingSafeEqual } from 'node:crypto';

import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { syncContext } from '@/lib/google/context';
import { googleCookieOptions } from '@/lib/google/cookies';
import { CALENDAR_SCOPE, finishAuth, googleAvailable } from '@/lib/google/oauth';
import { connectGoogle } from '@/lib/services/calendar-sync';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Fim do OAuth: valida `state`, troca o código (PKCE), cifra os tokens e
 * prepara o calendário.
 */
export async function GET(req: Request): Promise<void> {
  await requireOwner();

  if (!googleAvailable()) redirect('/configuracoes?google=preview');

  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const state = jar.get('g_state')?.value;
  const verifier = jar.get('g_verifier')?.value;

  jar.delete({ name: 'g_state', ...googleCookieOptions });
  jar.delete({ name: 'g_verifier', ...googleCookieOptions });

  const code = params.get('code');
  const got = params.get('state');

  if (params.get('error')) redirect('/configuracoes?google=denied');

  if (!code || !got || !state || !verifier || !same(got, state))
    redirect('/configuracoes?google=invalid');

  let ok = false;

  try {
    const g = await finishAuth(code, verifier);

    if (!g.scope.split(' ').includes(CALENDAR_SCOPE)) redirect('/configuracoes?google=scope');

    await connectGoogle(getDb(), syncContext(), g);
    ok = true;
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;

    console.error('google callback', e);
  }

  redirect(ok ? '/configuracoes?google=connected' : '/configuracoes?google=error');
}
