import { customType, timestamp } from 'drizzle-orm/pg-core';

export const tstz = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => tstz('created_at').defaultNow().notNull();
export const updatedAt = () => tstz('updated_at').defaultNow().notNull();

/**
 * Text COLLATE "C": chaves do fractional-indexing só ordenam certo em ordem
 * binária.
 */
export const textC = customType<{ data: string }>({ dataType: () => 'text collate "C"' });
