import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

/**
 * Banco dedicado dos e2e: `<banco>_e2e`, recriado a cada execução. Nunca o de
 * desenvolvimento.
 */
export function e2eDatabaseUrl(base = process.env.DATABASE_URL): string {
  if (!base) throw new Error('DATABASE_URL ausente (veja .env.example)');

  const url = new URL(base);

  url.pathname = `/${url.pathname.slice(1).replace(/_e2e$/, '')}_e2e`;

  return url.toString();
}

/**
 * Aponta este processo (e os workers e servidores que herdam) para o banco dos
 * e2e.
 */
export function pointToE2eDatabase(): { DATABASE_URL: string; DATABASE_URL_UNPOOLED: string } {
  const url = e2eDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_UNPOOLED = url;

  return { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
}
