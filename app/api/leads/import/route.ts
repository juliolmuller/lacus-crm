import Papa from 'papaparse';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { applyMapping } from '@/lib/leads/csv';
import { importLeads } from '@/lib/services/import';
import * as cat from '@/lib/services/import-catalog';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;

const form = z.object({
  kind: z.enum(['leads', 'nichos', 'cidades', 'fila', 'uso-api', 'top-leads']),
  dryRun: z.enum(['0', '1']),
  insertOnly: z.enum(['0', '1']).default('0'),
  mapping: z.string().optional(),
});

/** Dry-run (dryRun=1) e importação real. O arquivo é lido em memória e nada é enviado para fora. */
export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const fd = await req.formData();
  const file = fd.get('file');
  const parsed = form.safeParse(
    Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'file')),
  );
  if (!(file instanceof File) || !parsed.success)
    return Response.json({ error: 'Envie um arquivo CSV e escolha o tipo.' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: 'Arquivo maior que 10 MB.' }, { status: 413 });

  const text = (await file.text()).replace(/^﻿/, '');
  const { kind, dryRun: dry, insertOnly, mapping } = parsed.data;
  const dryRun = dry === '1';
  const db = getDb();
  const table = () =>
    Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
  try {
    switch (kind) {
      case 'leads': {
        const map = mapping ? (JSON.parse(mapping) as Record<string, string | null>) : {};
        const rows = table().map((r) => applyMapping(r, map));
        return Response.json(
          await importLeads(db, rows, {
            dryRun,
            insertOnly: insertOnly === '1',
            dataSource: 'import_csv',
          }),
        );
      }
      case 'nichos':
        return Response.json(await cat.importNiches(db, text, { dryRun }));
      case 'cidades':
        return Response.json(await cat.importRegions(db, table(), { dryRun }));
      case 'fila':
        return Response.json(await cat.importQueue(db, table(), { dryRun }));
      case 'uso-api':
        return Response.json(
          await cat.importApiUsage(db, Papa.parse<string[]>(text).data, { dryRun }),
        );
      case 'top-leads':
        return Response.json(await cat.importTopLeads(db, table(), { dryRun }));
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
