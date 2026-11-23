import { desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { type Scope, SCOPES } from '@/lib/auth/mcp-resources';
import { type Db, schema } from '@/lib/db';
import { sha256 } from '@/lib/hash';

const { apiTokens } = schema;

export const TOKEN_PREFIX = 'lcrm_';
export const RATE_LIMIT_PER_MIN = 120;
const TOUCH_EVERY_MS = 60_000;

/**
 * Guarda só o hash (SHA-256); o texto completo é mostrado uma vez, na criação.
 */
export const hashToken = sha256;
export const looksLikePat = (raw: string): boolean => raw.startsWith(TOKEN_PREFIX);

export async function createToken(
  db: Db,
  input: { expiresAt?: Date | null; name: string; scopes: Scope[] },
) {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const [row] = await db
    .insert(apiTokens)
    .values({
      name: input.name.trim(),
      scopes: input.scopes.filter((s) => SCOPES.includes(s)),
      tokenPrefix: token.slice(0, 8),
      tokenHash: hashToken(token),
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  return { token, row: row! };
}

export const listTokens = (db: Db) =>
  db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      scopes: apiTokens.scopes,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt));

export async function revokeToken(db: Db, id: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: sql`coalesce(${apiTokens.revokedAt}, now())` })
    .where(eq(apiTokens.id, id));
}

export interface VerifiedToken {
  id: string;
  name: string;
  scopes: Scope[];
}
export type Verification =
  { ok: false; reason: 'expired' | 'invalid' | 'revoked' } | { ok: true; token: VerifiedToken };

/**
 * Token existe, não foi revogado nem expirou. `last_used_at` é regravado no
 * máximo a cada 1 min.
 */
export async function verifyToken(db: Db, raw: string, now = new Date()): Promise<Verification> {
  const [t] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(raw)));

  if (!t) return { ok: false, reason: 'invalid' };

  if (t.revokedAt) return { ok: false, reason: 'revoked' };

  if (t.expiresAt && t.expiresAt <= now) return { ok: false, reason: 'expired' };

  if (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() >= TOUCH_EVERY_MS)
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        sql`${apiTokens.id} = ${t.id} and (${apiTokens.lastUsedAt} is null or ${apiTokens.lastUsedAt} < ${new Date(now.getTime() - TOUCH_EVERY_MS).toISOString()}::timestamptz)`,
      );

  return { ok: true, token: { id: t.id, name: t.name, scopes: t.scopes as Scope[] } };
}

/**
 * `write` inclui `read`; `prospecting` é separado. Vale para PAT e OAuth.
 */
export const allows = (granted: readonly string[], needed: readonly Scope[]): boolean =>
  needed.some((n) => granted.includes(n) || (n === 'read' && granted.includes('write')));

// shortcut: janela fixa de 1 min em memória, por instância. Em várias instâncias o limite efetivo
// é maior; para exatidão, trocar por contador no banco (upsert por token e minuto).
const windows = new Map<string, { count: number; minute: number }>();
/**
 * True = dentro do limite de 120 req/min por token.
 */
export function withinRateLimit(tokenId: string, now = Date.now()): boolean {
  const minute = Math.floor(now / 60_000);
  const w = windows.get(tokenId);

  if (!w || w.minute !== minute) {
    windows.set(tokenId, { minute, count: 1 });

    return true;
  }

  return ++w.count <= RATE_LIMIT_PER_MIN;
}
