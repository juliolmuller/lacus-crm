import 'server-only';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getDb, schema } from '@/lib/db';
import { getEnv } from '@/lib/env';

import { isOwner } from './allowlist';
import { getAuth } from './auth';
import { E2E_SUB, isE2EBypassActive } from './bypass';

/**
 * Sessão atual ou null (sem checar o dono).
 */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

/**
 * Exige sessão válida de dono, a cada chamada (o proxy só olha o cookie). Toda
 * Server Action, Route Handler e Server Component com dados chama isto.
 */
export const requireOwner = cache(async () => {
  const session = await getSession();

  if (!session) redirect('/login');

  const [account] = await getDb()
    .select({ sub: schema.auth_accounts.accountId })
    .from(schema.auth_accounts)
    .where(
      and(
        eq(schema.auth_accounts.userId, session.user.id),
        eq(schema.auth_accounts.providerId, 'vercel'),
      ),
    )
    .limit(1);

  const env = getEnv();
  const allowed =
    (isE2EBypassActive() && account?.sub === E2E_SUB)
    || isOwner(
      { sub: account?.sub, email: session.user.email, emailVerified: session.user.emailVerified },
      { sub: env.OWNER_VERCEL_USER_ID, email: env.OWNER_EMAIL },
    );

  if (!allowed) redirect('/login?error=access_denied');

  return session;
});
