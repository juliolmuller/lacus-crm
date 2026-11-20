import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';

const { oauthConsent, oauthClient, oauthAccessToken, oauthRefreshToken } = schema;

/** Conectores OAuth autorizados (claude.ai etc.), com o nome que o cliente informou. */
export const listConnectors = (db: Db) =>
  db
    .select({
      clientId: oauthConsent.clientId,
      name: sql<string | null>`${oauthClient.name}`,
      scopes: oauthConsent.scopes,
      authorizedAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .orderBy(desc(oauthConsent.createdAt));

/** Revogar = apagar consentimento e tokens; o acesso já emitido (JWT) expira em até 15 min. */
export const revokeConnector = (db: Db, clientId: string) =>
  db.transaction(async (tx) => {
    await tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, clientId));
    await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId));
    await tx.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
  });
