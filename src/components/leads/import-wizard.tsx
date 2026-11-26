'use client';

import { ArrowLeft, Download, FileUp } from 'lucide-react';
import Link from 'next/link';
import Papa from 'papaparse';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { autoMapHeaders, LABELS } from '@/lib/leads/csv';
import { type ImportReport } from '@/lib/services/import';
import { type CatalogReport } from '@/lib/services/import-catalog';

const KINDS = {
  'leads': 'Leads (39 colunas da planilha)',
  'nichos': 'Nichos',
  'cidades': 'Cidades / regiões',
  'fila': 'Fila de prospecção',
  'uso-api': 'Uso da API',
  'top-leads': 'Top leads',
} as const;
type Kind = keyof typeof KINDS;
type Report = Partial<CatalogReport> & Partial<ImportReport>;

const ACTION = {
  create: 'Criar',
  update: 'Atualizar',
  unchanged: 'Sem mudança',
  skip: 'Ignorar',
  error: 'Erro',
} as const;

function download(name: string, rows: string[][]): void {
  const csv = `\uFEFF${Papa.unparse(rows, { delimiter: ';', quotes: true })}`;
  const a = document.createElement('a');

  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Importação em 4 passos: arquivo → mapeamento → dry-run → confirmação.
 */
export function ImportWizard({
  defaultInsertOnly,
}: {
  defaultInsertOnly: boolean;
}): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('leads');
  const [file, setFile] = useState<File>();
  const [mapping, setMapping] = useState<Record<string, null | string>>({});
  const [insertOnly, setInsertOnly] = useState(defaultInsertOnly);
  const [report, setReport] = useState<Report>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined): Promise<void> {
    setReport(undefined);
    setDone(false);

    if (!f) return setFile(undefined);

    const head = await new Promise<string[]>((res) =>
      Papa.parse<string[]>(f, { preview: 1, complete: (r) => res(r.data[0] ?? []) }),
    );

    setMapping(autoMapHeaders(head.map((h) => h.replace(/^\uFEFF/, ''))));
    setFile(f); // só depois do mapeamento: o botão de simular depende dele
  }

  async function run(dryRun: boolean): Promise<void> {
    if (!file) return;

    setBusy(true);

    const fd = new FormData();

    fd.set('file', file);
    fd.set('kind', kind);
    fd.set('dryRun', dryRun ? '1' : '0');
    fd.set('insertOnly', insertOnly ? '1' : '0');

    if (kind === 'leads') fd.set('mapping', JSON.stringify(mapping));

    try {
      const res = await fetch('/api/leads/import', { method: 'POST', body: fd });
      const body = await res.json();

      if (!res.ok) throw new Error(body.error ?? 'Falha na importação');

      setReport(body);
      setDone(!dryRun);

      if (!dryRun) toast.success('Importação concluída');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = report?.rows ?? [];
  const mapped = Object.values(mapping).filter(Boolean) as string[];
  const missing = LABELS.filter((h) => !mapped.includes(h));

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-body text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> Leads
      </Link>
      <h1 className="text-page">Importar CSV</h1>

      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <h2 className="text-section">1. Arquivo</h2>
          <SelectField
            label="Tipo"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setReport(undefined);
            }}
          >
            {Object.entries(KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectField>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-1 p-4 text-body hover:bg-surface-2">
            <FileUp className="size-5 text-text-muted" aria-hidden />
            <span>{file ? file.name : 'Escolher arquivo .csv (UTF-8, até 10 MB)'}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Arquivo CSV"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        </li>

        {file && kind === 'leads' && (
          <li className="flex flex-col gap-3">
            <h2 className="text-section">2. Mapeamento</h2>
            <p className="text-body text-text-muted">
              Os cabeçalhos da planilha são reconhecidos sozinhos. Ajuste o que não bateu.
              {missing.length > 0
                && ` Sem coluna no arquivo: ${missing.length} campos (ficam como estão).`}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.keys(mapping).map((h) => (
                <SelectField
                  key={h}
                  label={`Coluna "${h}"`}
                  value={mapping[h] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}
                >
                  <option value="">Ignorar</option>
                  {LABELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </SelectField>
              ))}
            </div>
            <label className="flex items-start gap-2 text-body">
              <input
                type="checkbox"
                checked={insertOnly}
                onChange={(e) => setInsertOnly(e.target.checked)}
                className="mt-1"
              />
              <span>
                Somente novos
                <span className="block text-label text-text-muted">
                  Ignora leads que já existem (mesmo ID ou Place ID). Recomendado em produção.
                </span>
              </span>
            </label>
          </li>
        )}

        {file && (
          <li className="flex flex-col gap-3">
            <h2 className="text-section">{kind === 'leads' ? '3' : '2'}. Simulação (dry-run)</h2>
            <div>
              <Button variant="secondary" loading={busy && !done} onClick={() => run(true)}>
                Simular importação
              </Button>
            </div>
          </li>
        )}
      </ol>

      {report && (
        <div className="flex flex-col gap-4" aria-live="polite">
          <h2 className="text-section">{done ? 'Resultado' : 'Prévia'}</h2>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Badge tone="success">Criar: {report.created ?? 0}</Badge>
            </li>
            <li>
              <Badge tone="primary">Atualizar: {report.updated ?? 0}</Badge>
            </li>
            <li>
              <Badge>Sem mudança: {report.unchanged ?? 0}</Badge>
            </li>
            <li>
              <Badge tone="warning">Ignorar: {report.skipped ?? 0}</Badge>
            </li>
            <li>
              <Badge tone="danger">Erros: {report.errors ?? 0}</Badge>
            </li>
            {report.deals ? (
              <li>
                <Badge>Negociações: {report.deals}</Badge>
              </li>
            ) : null}
            {report.interactions ? (
              <li>
                <Badge>Interações: {report.interactions}</Badge>
              </li>
            ) : null}
          </ul>
          {report.scoreDivergences && report.scoreDivergences.length > 0 && (
            <p className="text-body">
              Score diferente da planilha em {report.scoreDivergences.length} leads (o CRM
              recalcula):{' '}
              {report.scoreDivergences
                .slice(0, 5)
                .map((d) => `${d.name} (${d.sheet} → ${d.computed})`)
                .join('; ')}
            </p>
          )}
          {report.ticketMismatches && report.ticketMismatches.length > 0 && (
            <p className="text-body">
              Ticket diferente do nicho em {report.ticketMismatches.length} leads.
            </p>
          )}
          {report.newRegions && report.newRegions.length > 0 && (
            <p className="text-body">Regiões novas: {report.newRegions.join(', ')}.</p>
          )}
          {report.messages && report.messages.length > 0 && (
            <ul className="text-body text-text-muted">
              {report.messages.slice(0, 10).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-table">
                <caption className="sr-only">Prévia das primeiras 20 linhas</caption>
                <thead className="bg-surface-2 text-left text-label text-text-muted">
                  <tr>
                    <th className="p-2">Linha</th>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Ação</th>
                    <th className="p-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="tabular p-2">{r.line}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{ACTION[r.action]}</td>
                      <td className="p-2 text-text-muted">
                        {r.reason ?? r.changed?.join(', ') ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {rows.length > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  download('relatorio-importacao.csv', [
                    ['Linha', 'Nome', 'Ação', 'Detalhe'],
                    ...rows.map((r) => [
                      String(r.line),
                      r.name,
                      ACTION[r.action],
                      r.reason ?? r.changed?.join(', ') ?? '',
                    ]),
                  ])
                }
              >
                <Download className="size-4" aria-hidden /> Baixar relatório
              </Button>
            )}
            {!done && (
              <Button
                loading={busy}
                disabled={
                  (report.errors ?? 0) > 0 && (report.created ?? 0) + (report.updated ?? 0) === 0
                }
                onClick={() => run(false)}
              >
                Confirmar importação
              </Button>
            )}
            {done && (
              <Link
                href="/leads"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-body font-medium text-primary-fg hover:bg-primary-hover"
              >
                Ver leads
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
