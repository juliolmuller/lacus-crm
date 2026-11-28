/**
 * Só avisa, nunca migra nem bloqueia: o banco de desenvolvimento é do
 * desenvolvedor.
 */
async function warnIfMigrationsPending(): Promise<void> {
  const m = await import('./lib/db/migrations');
  const status = await m.checkMigrationStatus(
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    { timeoutMs: 2000 },
  );

  if (status.kind !== 'up-to-date') console.warn(`[db] ${m.formatMigrationStatus(status)}`);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./lib/env');

    getEnv(); // falha cedo, com mensagem clara, se faltar variável

    // Cobre `bun run dev` e `bunx next dev` (Playwright). Sem await: não atrasa a subida do servidor.
    if (process.env.NODE_ENV === 'development') warnIfMigrationsPending().catch(() => {});
  }
}
