// Importa os CSVs de .data/ para o banco local: `pnpm db:import [--insert-only] [--dry-run]`.
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
const short = (r: { messages?: string[] }) => ({
  ...r,
  rows: undefined,
  messages: r.messages?.slice(0, 5),
});
for (const [k, v] of Object.entries(out))
  console.log(k, JSON.stringify(short(v as { messages?: string[] })));
process.exit(0);
