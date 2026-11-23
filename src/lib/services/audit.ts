import { type Db, schema } from '@/lib/db';

/**
 * `actor`: `user`, `mcp:<tokenId>`, `rule` ou `job` (SPEC 4).
 */
export const audit = (
  db: Db,
  e: { action: string; actor: string; diff?: unknown; entity: string; entityId: string },
) => db.insert(schema.auditLog).values({ ...e, diff: e.diff ?? null });
