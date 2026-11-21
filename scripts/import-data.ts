// Importa os CSVs de .data/ para o banco local: `bun run db:import [--insert-only] [--dry-run]`.
// Ordem: nichos → cidades → fila → leads → top leads → uso da API. Gera os relatórios em .data/.
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';

config({ path: '.env.local', quiet: true });

const { getDb } = await import('@/lib/db');
const { applyMapping, autoMapHeaders } = await import('@/lib/leads/csv');
const { importLeads } = await import('@/lib/services/import');
const cat = await import('@/lib/services/import-catalog');

const args = process.argv.slice(2);
const insertOnly = args.includes('--insert-only');
const dryRun = args.includes('--dry-run');
const dir = '.data';
const text = (f: string) => readFileSync(`${dir}/${f}`, 'utf8').replace(/^﻿/, '');
const table = (f: string) =>
  Papa.parse<Record<string, string>>(text(f), { header: true, skipEmptyLines: true }).data;
const matrix = (f: string) => Papa.parse<string[]>(text(f), { skipEmptyLines: false }).data;

const db = getDb();
const out: Record<string, unknown> = {};

if (existsSync(`${dir}/nichos.csv`))
  out.nichos = await cat.importNiches(db, text('nichos.csv'), { dryRun });
if (existsSync(`${dir}/cidades.csv`))
  out.cidades = await cat.importRegions(db, table('cidades.csv'), { dryRun });
if (existsSync(`${dir}/fila.csv`))
  out.fila = await cat.importQueue(db, table('fila.csv'), { dryRun });

const leadsFile = `leads_PR-Curitiba.csv`;
if (existsSync(`${dir}/${leadsFile}`)) {
  const rows = table(leadsFile);
  const mapping = autoMapHeaders(Object.keys(rows[0] ?? {}));
  const rep = await importLeads(
    db,
    rows.map((r) => applyMapping(r, mapping)),
    { insertOnly, dryRun, dataSource: 'import_sheet' },
  );
  out.leads = rep;
}
if (existsSync(`${dir}/top-leads.csv`))
  out.topLeads = await cat.importTopLeads(db, table('top-leads.csv'), { dryRun });
if (existsSync(`${dir}/uso-da-api.csv`))
  out.usoApi = await cat.importApiUsage(db, matrix('uso-da-api.csv'), { dryRun });

writeFileSync(`${dir}/import-report.json`, JSON.stringify(out, null, 2));

// Candidatos a "Não contatar": só relatório, nada é aplicado (PLAN, decisão 4).
const cands = new Map<string, { id: string; name: string; status: string; evidence: string[] }>();
for (const k of ['leads', 'topLeads'] as const)
  for (const c of (
    out[k] as
      | { dncCandidates?: { id: string; name: string; status: string; evidence: string[] }[] }
      | undefined
  )?.dncCandidates ?? [])
    cands.set(c.id, c);
const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 160);
writeFileSync(
  `${dir}/dnc-candidates.md`,
  [
    '# Candidatos a "Não contatar" (NÃO aplicados)',
    '',
    `Gerado por \`bun run db:import\` em ${new Date().toISOString().slice(0, 10)}. Nada foi marcado no banco: o Júlio confirma cada caso.`,
    '',
    '| Lead | Status | ID | Evidência |',
    '|---|---|---|---|',
    ...[...cands.values()].map(
      (c) => `| ${c.name} | ${c.status} | \`${c.id}\` | ${c.evidence.map(cell).join(' / ')} |`,
    ),
    '',
    'Para aplicar um caso: abrir o lead em `/leads` e usar **Não contatar** (opt-out).',
    '',
  ].join('\n'),
);
const short = (r: { messages?: string[] }) => ({
  ...r,
  rows: undefined,
  messages: r.messages?.slice(0, 5),
});
for (const [k, v] of Object.entries(out))
  console.log(k, JSON.stringify(short(v as { messages?: string[] })));
process.exit(0);
