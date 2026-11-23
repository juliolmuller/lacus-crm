'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Ban, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { bareControl } from '@/components/ui/field';
import { formatDate, spDate } from '@/lib/leads/csv';
import { type SORTS, TABLE_COLUMNS, type TableColumn } from '@/lib/leads/filters';
import { type ContactStatus, contactStatuses, siteLabel, statusLabel } from '@/lib/leads/labels';
import { type LeadListRow } from '@/lib/services/lead-list';
import { cn } from '@/lib/utils';

type Sort = (typeof SORTS)[number];
type Inline =
  | { field: 'contactStatus'; value: ContactStatus }
  | { field: 'nextAction'; value: string }
  | { field: 'priority'; value: null | number };

export interface LeadsTableProps {
  columns: TableColumn[];
  dir: 'asc' | 'desc';
  initialCursor: null | string;
  initialRows: LeadListRow[];
  loadMore: (
    qs: string,
    cursor: string,
  ) => Promise<{ nextCursor: null | string; rows: LeadListRow[] }>;
  onOpen: (id: string) => void;
  onSort: (s: Sort) => void;
  /**
   * Query string dos filtros (sem `lead`), repassada ao carregar mais páginas.
   */
  qs: string;
  sort: Sort;
  update: (id: string, input: Inline) => Promise<{ error: string; ok: false } | { ok: true }>;
}

const WIDTH: Record<TableColumn, number> = {
  score: 76,
  name: 280,
  niche: 200,
  region: 210,
  status: 160,
  site: 130,
  rating: 130,
  whatsapp: 100,
  nextAction: 230,
  contact: 130,
  priority: 100,
};
const SORT_OF: Partial<Record<TableColumn, Sort>> = {
  score: 'score',
  name: 'name',
  contact: 'contact',
  priority: 'priority',
};
/**
 * Estimativa (Confortável); as linhas reais usam `--row-h` (densidade) e
 * `measureElement` corrige. Fixa para não divergir entre servidor e cliente.
 */
const ROW_H = 44;

/**
 * Tabela virtualizada: só as linhas visíveis existem no DOM; o fim da rolagem
 * pede a próxima página (cursor).
 */
export function LeadsTable(p: LeadsTableProps): React.JSX.Element {
  const [rows, setRows] = useState(p.initialRows);
  const [cursor, setCursor] = useState(p.initialCursor);
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cols: TableColumn[] = ['name', ...p.columns.filter((c) => c !== 'name')].sort(
    (a, b) => Object.keys(TABLE_COLUMNS).indexOf(a) - Object.keys(TABLE_COLUMNS).indexOf(b),
  ) as TableColumn[];
  const template = cols.map((c) => `${WIDTH[c]}px`).join(' ');
  const minWidth = cols.reduce((s, c) => s + WIDTH[c], 0);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const items = virt.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  useEffect(() => {
    if (!cursor || loading || lastIndex < rows.length - 15) return;

    // eslint-disable-next-line @eslint-react/set-state-in-effect -- marca a página que este efeito começa a buscar
    setLoading(true);
    p.loadMore(p.qs, cursor)
      .then((page) => {
        setRows((r) => [...r, ...page.rows.filter((n) => !r.some((o) => o.id === n.id))]);
        setCursor(page.nextCursor);
      })
      .catch(() => toast.error('Não foi possível carregar mais leads.'))
      .finally(() => setLoading(false));
  }, [cursor, loading, lastIndex, rows.length, p]);

  async function edit(row: LeadListRow, input: Inline): Promise<void> {
    const before = row[input.field];
    const patch = (value: unknown): void =>
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [input.field]: value } : r)));

    patch(input.field === 'nextAction' ? input.value || null : input.value); // otimista

    const res = await p.update(row.id, input);

    if (!res.ok) {
      patch(before); // rollback
      toast.error(res.error);
    }
  }

  if (!rows.length)
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhum lead encontrado"
        action={
          <Link href="/leads" className="text-primary underline-offset-4 hover:underline">
            Limpar filtros
          </Link>
        }
      >
        Ajuste a busca ou os filtros. Leads marcados como Não contatar ficam ocultos por padrão.
      </EmptyState>
    );

  return (
    <div
      ref={scrollerRef}
      className="h-[calc(100dvh-20rem)] min-h-96 overflow-auto rounded-lg border border-border bg-surface-1 lg:h-[calc(100dvh-17rem)]"
    >
      <div role="table" aria-label="Leads" aria-rowcount={rows.length + 1} style={{ minWidth }}>
        <div
          role="row"
          className="sticky top-0 z-10 grid border-b border-border bg-surface-2 text-label text-text-muted"
          style={{ gridTemplateColumns: template }}
        >
          {cols.map((c) => {
            const s = SORT_OF[c];
            const active = s && s === p.sort;

            return (
              <div
                key={c}
                role="columnheader"
                aria-sort={active ? (p.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className="flex h-10 items-center px-3"
              >
                {s ? (
                  <button
                    type="button"
                    onClick={() => p.onSort(s)}
                    className="inline-flex items-center gap-1 hover:text-text"
                  >
                    {TABLE_COLUMNS[c]}
                    {active
                      && (p.dir === 'asc' ? (
                        <ArrowUp className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden />
                      ))}
                  </button>
                ) : (
                  TABLE_COLUMNS[c]
                )}
              </div>
            );
          })}
        </div>
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {items.map((v) => {
            const r = rows[v.index]!;

            return (
              <div
                key={r.id}
                ref={virt.measureElement}
                data-index={v.index}
                role="row"
                aria-rowindex={v.index + 2}
                data-testid="lead-row"
                className={cn(
                  'absolute inset-x-0 grid items-center border-b border-border text-table hover:bg-surface-2',
                )}
                style={{
                  height: 'var(--row-h)',
                  transform: `translateY(${v.start}px)`,
                  gridTemplateColumns: template,
                }}
              >
                {cols.map((c) => (
                  <div key={c} role="cell" className="min-w-0 px-3">
                    <Cell col={c} row={r} onOpen={p.onOpen} edit={edit} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {loading && (
        <p role="status" className="p-3 text-center text-label text-text-muted">
          Carregando mais…
        </p>
      )}
    </div>
  );
}

function Cell({
  col,
  row,
  onOpen,
  edit,
}: {
  col: TableColumn;
  edit: (row: LeadListRow, input: Inline) => void;
  onOpen: (id: string) => void;
  row: LeadListRow;
}): React.JSX.Element {
  switch (col) {
    case 'contact':
      return (
        <span className="tabular">
          {row.lastContactAt ? formatDate(spDate(row.lastContactAt)) : '—'}
        </span>
      );
    case 'name':
      return (
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className={cn(
            'block w-full truncate text-left font-medium hover:text-primary hover:underline',
            row.doNotContact ? 'text-text-muted' : 'text-text',
          )}
          title={row.name}
        >
          {row.doNotContact && (
            <>
              <Ban aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-danger-text" />
              <span className="sr-only">Não contatar: </span>
            </>
          )}
          {row.name}
        </button>
      );
    case 'nextAction':
      return (
        <input
          aria-label={`Próxima ação de ${row.name}`}
          defaultValue={row.nextAction ?? ''}
          key={row.nextAction ?? ''}
          maxLength={300}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => {
            const v = e.target.value.trim();

            if (v !== (row.nextAction ?? '')) edit(row, { field: 'nextAction', value: v });
          }}
          className={cn(bareControl, 'w-full')}
        />
      );
    case 'niche':
      return <span className="block truncate">{row.nicheName}</span>;
    case 'priority':
      return (
        <input
          type="number"
          min={0}
          max={999}
          aria-label={`Prioridade de ${row.name}`}
          defaultValue={row.priority ?? ''}
          key={row.priority ?? ''}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);

            if (v !== row.priority) edit(row, { field: 'priority', value: v });
          }}
          className={cn(bareControl, 'tabular w-20')}
        />
      );
    case 'rating':
      return (
        <span className="tabular">
          {row.mapsRating ? `${Number(row.mapsRating).toFixed(1)} (${row.mapsReviews ?? 0})` : '—'}
        </span>
      );
    case 'region':
      return <span className="block truncate">{row.regionLabel.replace(/^[A-Z]{2} - /, '')}</span>;
    case 'score':
      return <ScoreBadge score={row.score} />;
    case 'site':
      return <span className="block truncate">{siteLabel[row.websiteStatus ?? 'unknown']}</span>;
    case 'status':
      return row.doNotContact ? (
        <StatusBadge status={row.contactStatus} />
      ) : (
        <select
          aria-label={`Status de ${row.name}`}
          value={row.contactStatus}
          onChange={(e) =>
            edit(row, { field: 'contactStatus', value: e.target.value as ContactStatus })
          }
          className={cn(bareControl, 'w-full')}
        >
          {contactStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
      );
    case 'whatsapp':
      return <span>{row.hasWhatsapp ? 'Sim' : 'Não'}</span>;
  }
}
