// Aplica as migrations pendentes: `bun run db:migrate` (à mão) e `bun scripts/migrate.ts --deploy` (build de produção).
// Em `--deploy` só migra com VERCEL_ENV=production, nunca aplica migration manual (`-- lacus:manual`) e falha o build em qualquer erro.
// O migrator do drizzle aplica todas as pendentes numa única transação: se uma falha, nenhuma é aplicada.
import { config } from 'dotenv';

import {
  ManualMigrationError,
  MigrationLockTimeoutError,
  resolveDeployAction,
  runMigrations,
} from '../src/lib/db/migrations';

// dotenv nunca sobrescreve variáveis já definidas, então os comandos do docs/DEPLOY.md continuam valendo.
config({ path: '.env.local', quiet: true });

const deploy = process.argv.includes('--deploy');
const lockTimeoutMs = Number(process.env.MIGRATIONS_LOCK_TIMEOUT_MS) || undefined;

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  let url: string | undefined;

  if (deploy) {
    const decision = resolveDeployAction(process.env);

    if (decision.action === 'skip') {
      console.info(
        decision.reason === 'emergency'
          ? 'ATENÇÃO: migrations puladas por SKIP_DB_MIGRATIONS. Remova a variável depois do deploy de emergência.'
          : `Migrations não aplicadas: VERCEL_ENV=${decision.vercelEnv ?? '(vazio)'} (só produção migra)`,
      );

      return;
    }

    if (decision.action === 'error') return fail(decision.message);

    url = decision.url;
  } else {
    url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

    if (!url) return fail('DATABASE_URL não definida (veja .env.example)');
  }

  try {
    const applied = await runMigrations({ url, deploy, lockTimeoutMs });

    if (!applied.length) console.info('Nenhuma migration pendente.');

    for (const tag of applied) console.info(`migrate: ${tag}`);
  } catch (err) {
    if (err instanceof ManualMigrationError) {
      return fail(
        [
          `Build interrompido: ${err.tags.length} migration(s) manual(is) pendente(s): ${err.tags.join(', ')}.`,
          'Nada foi aplicado. Elas reescrevem dados ou quebram o código atual, então exigem um passo manual:',
          '  1. Crie um branch de backup no Neon (docs/DEPLOY.md, passo 3).',
          '  2. Rode `bun run db:migrate` na sua máquina, com DATABASE_URL_UNPOOLED apontando para o banco de produção.',
          '  3. Faça o redeploy: ele não encontrará nada pendente.',
        ].join('\n'),
      );
    }

    const message =
      err instanceof MigrationLockTimeoutError
        ? err.message
        : // Mensagens do pg/drizzle não carregam a URL de conexão; ainda assim, só a primeira linha.
          (err instanceof Error ? err.message : String(err)).split('\n')[0];

    fail(
      `Falha ao aplicar migrations: ${message}. Nada foi aplicado (transação única).${deploy ? ' Deploy interrompido.' : ''}`,
    );
  }
}

await main();
