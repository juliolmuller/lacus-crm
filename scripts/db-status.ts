// Mostra se o banco está atrás das migrations do repositório: `bun run db:status [--quiet] [--strict]`.
// --quiet: silencioso quando está em dia. --strict: sai com 1 se houver pendentes ou o banco estiver inacessível.
import { config } from 'dotenv';

import { checkMigrationStatus, formatMigrationStatus } from '../src/lib/db/migrations';

config({ path: '.env.local', quiet: true });

const quiet = process.argv.includes('--quiet');
const strict = process.argv.includes('--strict');
const status = await checkMigrationStatus(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);

if (status.kind === 'up-to-date') {
  if (!quiet) console.info(formatMigrationStatus(status));
} else {
  console.warn(`⚠ ${formatMigrationStatus(status)}`);
}

if (strict && (status.kind === 'pending' || status.kind === 'unreachable')) process.exitCode = 1;
