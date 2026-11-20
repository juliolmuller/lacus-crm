import 'server-only';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { getEnv } from '@/lib/env';
import type { GoogleDeps } from './calendar-api';

/** Escopo mínimo (SPEC 10): cria calendários secundários e gerencia só os eventos deles. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'openid',
  'email',
];
export const CALENDAR_SCOPE = GOOGLE_SCOPES[0]!;

export const googleConfigured = () => {
  const e = getEnv();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
};

/** Conectar só vale em local e produção: as redirect URIs do Google são fixas (SPEC 10). */
export const googleAvailable = () => process.env.VERCEL_ENV !== 'preview';

export const redirectUri = () => `${getEnv().NEXT_PUBLIC_APP_URL}/api/google/callback`;

function client() {
  const e = getEnv();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error('Google não configurado');
  return new OAuth2Client({
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(),
  });
}

/** `state` + PKCE (S256); o chamador guarda `state` e `verifier` em cookie. */
export async function startAuth(state: string) {
  const c = client();
  const { codeVerifier, codeChallenge } = await c.generateCodeVerifierAsync();
  const url = c.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeChallenge,
  });
  return { url, verifier: codeVerifier };
}

export async function finishAuth(code: string, verifier: string) {
  const c = client();
  const { tokens } = await c.getToken({ code, codeVerifier: verifier });
  if (!tokens.refresh_token || !tokens.access_token || !tokens.id_token)
    throw new Error(
      'O Google não devolveu o refresh token. Revogue o acesso em myaccount.google.com/permissions e conecte de novo.',
    );
  const ticket = await c.verifyIdToken({
    idToken: tokens.id_token,
    audience: getEnv().GOOGLE_CLIENT_ID,
  });
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3_000_000),
    email: ticket.getPayload()?.email ?? '',
    scope: tokens.scope ?? '',
  };
}

export async function revokeGoogleToken(token: string) {
  await client().revokeToken(token);
}

export function realDeps(): GoogleDeps {
  return {
    fetch: (...a) => fetch(...a),
    async refresh(refreshToken) {
      const c = client();
      c.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await c.refreshAccessToken();
      return {
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3_000_000),
      };
    },
  };
}
