'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { bareControl } from '@/components/ui/field';
import { formatDate, spDate } from '@/lib/leads/csv';
import { SORTS, TABLE_COLUMNS, type TableColumn } from '@/lib/leads/filters';
import { contactStatuses, siteLabel, statusLabel, type ContactStatus } from '@/lib/leads/labels';
import type { LeadListRow } from '@/lib/services/lead-list';
import { cn } from '@/lib/utils';

type Sort = (typeof SORTS)[number];
type Inline =
  | { field: 'contactStatus'; value: ContactStatus }
  | { field: 'nextAction'; value: string }
  | { field: 'priority'; value: number | null };

export type LeadsTableProps = {
  initialRows: LeadListRow[];
  initialCursor: string | null;
  /** Query string dos filtros (sem `lead`), repassada ao carregar mais páginas. */
  qs: string;
  columns: TableColumn[];
  sort: Sort;
  dir: 'asc' | 'desc';
  onSort: (s: Sort) => void;
  onOpen: (id: string) => void;
  loadMore: (
    qs: string,
    cursor: string,
  ) => Promise<{ rows: LeadListRow[]; nextCursor: string | null }>;
  update: (id: string, input: Inline) => Promise<{ ok: true } | { ok: false; error: string }>;
};

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
const ROW_H = 48;

/** Tabela virtualizada: só as linhas visíveis existem no DOM; o fim da rolagem pede a próxima página (cursor). */
export function LeadsTable(p: LeadsTableProps) {
  const [rows, setRows] = useState(p.initialRows);
  const [cursor, setCursor] = useState(p.initialCursor);
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const cols: TableColumn[] = ['name', ...p.columns.filter((c) => c !== 'name')].sort(
    (a, b) => Object.keys(TABLE_COLUMNS).indexOf(a) - Object.keys(TABLE_COLUMNS).indexOf(b),
  ) as TableColumn[];
  const template = cols.map((c) => `${WIDTH[c]}px`).join(' ');
  const minWidth = cols.reduce((s, c) => s + WIDTH[c], 0);

  // eslint-disable-next-line react-hooks/incompatible-library -- limitação conhecida do TanStack Virtual com o React Compiler
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const items = virt.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  useEffect(() => {
    if (!cursor || loading || lastIndex < rows.length - 15) return;
    setLoading(true);
    p.loadMore(p.qs, cursor)
      .then((page) => {
        setRows((r) => [...r, ...page.rows.filter((n) => !r.some((o) => o.id === n.id))]);
        setCursor(page.nextCursor);
      })
      .catch(() => toast.error('Não foi possível carregar mais leads.'))
      .finally(() => setLoading(false));
  }, [cursor, loading, lastIndex, rows.length, p]);

  async function edit(row: LeadListRow, input: Inline) {
    const before = row[input.field];
    const patch = (value: unknown) =>
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
      ref={scroller}
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
                    {active &&
                      (p.dir === 'asc' ? (
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
                role="row"
                aria-rowindex={v.index + 2}
                data-testid="lead-row"
                className={cn(
                  'absolute inset-x-0 grid items-center border-b border-border text-table hover:bg-surface-2',
                  r.doNotContact && 'opacity-60',
                )}
                style={{
                  height: ROW_H,
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
  row: LeadListRow;
  onOpen: (id: string) => void;
  edit: (row: LeadListRow, input: Inline) => void;
}) {
  switch (col) {
    case 'score':
      return <ScoreBadge score={row.score} />;
    case 'name':
      return (
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className="block w-full truncate text-left font-medium text-text hover:text-primary hover:underline"
          title={row.name}
        >
          {row.name}
        </button>
      );
    case 'niche':
      return <span className="block truncate">{row.nicheName}</span>;
    case 'region':
      return <span className="block truncate">{row.regionLabel.replace(/^[A-Z]{2} - /, '')}</span>;
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
    case 'site':
      return <span className="block truncate">{siteLabel[row.websiteStatus ?? 'unknown']}</span>;
    case 'rating':
      return (
        <span className="tabular">
          {row.mapsRating ? `${Number(row.mapsRating).toFixed(1)} (${row.mapsReviews ?? 0})` : '—'}
        </span>
      );
    case 'whatsapp':
      return <span>{row.hasWhatsapp ? 'Sim' : 'Não'}</span>;
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
    case 'contact':
      return (
        <span className="tabular">
          {row.lastContactAt ? formatDate(spDate(row.lastContactAt)) : '—'}
        </span>
      );
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
  }
}
