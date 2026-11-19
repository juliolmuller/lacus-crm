import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb, schema } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { isOwner } from './allowlist';

const DAY = 60 * 60 * 24;

function buildOptions() {
  const env = getEnv();
  const dev = process.env.NODE_ENV !== 'production';
  const previewOrigin = process.env.VERCEL_BRANCH_URL
    ? [`https://${process.env.VERCEL_BRANCH_URL}`]
    : [];

  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL, ...previewOrigin],
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        auth_users: schema.auth_users,
        auth_sessions: schema.auth_sessions,
        auth_accounts: schema.auth_accounts,
        auth_verifications: schema.auth_verifications,
      },
    }),
    user: {
      modelName: 'auth_users',
      // Recebe o perfil bruto do provedor (com `sub`) em create-user, link-account e a cada sign-in.
      validateUserInfo: ({ user, source }) => {
        const sub =
          typeof source.oauth?.profile?.sub === 'string' ? source.oauth.profile.sub : undefined;
        const ok =
          source.oauth?.providerId === 'vercel' &&
          isOwner(
            { sub, email: user.email, emailVerified: user.emailVerified },
            { sub: env.OWNER_VERCEL_USER_ID, email: env.OWNER_EMAIL },
          );
        if (ok) return;
        // Em dev, mostra o sub recebido para preencher OWNER_VERCEL_USER_ID.
        return {
          error: 'access_denied',
          errorDescription: dev
            ? `Acesso negado. sub recebido: ${sub ?? '(vazio)'}`
            : 'Acesso negado',
        };
      },
    },
    session: {
      modelName: 'auth_sessions',
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
    socialProviders:
      env.VERCEL_CLIENT_ID && env.VERCEL_CLIENT_SECRET
        ? {
            vercel: {
              clientId: env.VERCEL_CLIENT_ID,
              clientSecret: env.VERCEL_CLIENT_SECRET,
              scope: ['openid', 'email', 'profile'],
            },
          }
        : {},
    advanced: { database: { generateId: 'uuid' } },
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}

export const authOptions = buildOptions;

const globalForAuth = globalThis as unknown as { __auth?: ReturnType<typeof create> };
const create = () => betterAuth(buildOptions());

/** Singleton lazy: evita validar env/abrir pool durante imports em build. */
export const getAuth = () => (globalForAuth.__auth ??= create());
