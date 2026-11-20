import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';

/** `actor`: `user`, `mcp:<tokenId>`, `rule` ou `job` (SPEC 4). */
export const audit = (
  db: Db,
  e: { entity: string; entityId: string; action: string; actor: string; diff?: unknown },
) => db.insert(schema.auditLog).values({ ...e, diff: e.diff ?? null });
