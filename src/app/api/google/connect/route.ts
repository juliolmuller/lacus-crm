import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';

import { requireOwner } from '@/lib/auth/dal';
import { googleCookieOptions } from '@/lib/google/cookies';
import { googleAvailable, googleConfigured, startAuth } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

/**
 * Inicia o OAuth: `state` e verificador PKCE em cookies httpOnly de 10 min.
 */
export async function GET(): Promise<void> {
  await requireOwner();

  if (!googleAvailable()) redirect('/configuracoes?google=preview');

  if (!googleConfigured()) redirect('/configuracoes?google=not_configured');

  const state = randomBytes(24).toString('base64url');
  const { url, verifier } = await startAuth(state);
  const jar = await cookies();

  jar.set('g_state', state, googleCookieOptions);
  jar.set('g_verifier', verifier, googleCookieOptions);
  redirect(url);
}
