'use client';

import { Columns3, Download, Filter, Plus, Save, Search, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { debounce, useQueryStates } from 'nuqs';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteView, loadMoreLeads, saveView, updateInline } from '@/app/(app)/leads/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField, bareControl } from '@/components/ui/field';
import {
  TABLE_COLUMNS,
  leadSearchParams,
  tableColumnIds,
  type TableColumn,
} from '@/lib/leads/filters';
import { contactStatuses, siteLabel, statusLabel, websiteStatuses } from '@/lib/leads/labels';
import type { LeadListRow } from '@/lib/services/lead-list';
import { cn } from '@/lib/utils';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsTable } from './leads-table';

type Props = {
  rows: LeadListRow[];
  cursor: string | null;
  total: number;
  niches: { id: number; name: string }[];
  regions: { id: number; label: string }[];
  sources: string[];
  views: { id: number; name: string; qs: string }[];
  thresholds: { green: number; yellow: number };
};

const canon = (qs: URLSearchParams | string) => {
  const p = new URLSearchParams(qs);
  p.delete('lead');
  p.sort();
  return p.toString();
};

function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <details className="relative">
      <summary className={cn(bareControl, 'flex cursor-pointer list-none items-center gap-1')}>
        {label}
        {value.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-label text-primary-fg">
            {value.length}
          </span>
        )}
      </summary>
      <div className="absolute z-20 mt-1 flex max-h-72 min-w-48 flex-col gap-1 overflow-auto rounded-md border border-border-strong bg-surface-2 p-2 shadow-e2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={value.includes(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}

export function LeadsView(p: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  const [f, setF] = useQueryStates(leadSearchParams, { shallow: false, startTransition: start });
  const [draft, setDraft] = useState<string | null>(null); // texto em edição; null = segue a URL
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');

  const currentQs = canon(search);
  const filterQs = (() => {
    const q = new URLSearchParams(search);
    q.delete('lead');
    return q.toString();
  })();
  const active = p.views.find((v) => canon(v.qs) === currentQs);
  const exportQs = (sep: string) => {
    const q = new URLSearchParams(search);
    q.delete('lead');
    q.set('sep', sep);
    return `/api/leads/export?${q}`;
  };
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const open = (id: string) => (isMobile() ? router.push(`/leads/${id}`) : setF({ lead: id }));
  const hasFilters = currentQs !== '';

  const band = (min: number | null, max: number | null) => setF({ smin: min, smax: max });
  const bandValue =
    f.smin === p.thresholds.green && f.smax == null
      ? 'high'
      : f.smin === p.thresholds.yellow && f.smax === p.thresholds.green - 1
        ? 'mid'
        : f.smin == null && f.smax === p.thresholds.yellow - 1
          ? 'low'
          : '';

  return (
    <div
      className={cn('flex flex-col gap-3', pending && 'opacity-70 transition-opacity')}
      aria-busy={pending}
    >
      <nav
        aria-label="Visões salvas"
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        {[{ id: 0, name: 'Todos', qs: '' }, ...p.views].map((v) => {
          const on = canon(v.qs) === currentQs;
          return (
            <span key={v.id} className="flex items-center">
              <Link
                href={v.qs ? `/leads?${v.qs}` : '/leads'}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-body',
                  on
                    ? 'border-primary text-text'
                    : 'border-transparent text-text-muted hover:text-text',
                )}
              >
                {v.name}
              </Link>
              {on && v.id > 0 && (
                <button
                  type="button"
                  aria-label={`Excluir visão ${v.name}`}
                  className="rounded p-1 text-text-subtle hover:bg-surface-3 hover:text-danger"
                  onClick={async () => {
                    await deleteView(v.id);
                    router.push('/leads');
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-text-subtle"
            aria-hidden
          />
          <input
            type="search"
            aria-label="Buscar leads"
            placeholder="Nome, telefone, Instagram ou bairro"
            value={draft ?? f.q}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              setDraft(e.target.value);
              setF({ q: e.target.value || null }, { limitUrlUpdates: debounce(300) });
            }}
            className={cn(bareControl, 'h-9 w-full pl-9')}
          />
        </div>
        <MultiSelect
          label="Status"
          options={contactStatuses.map((s) => ({ value: s, label: statusLabel[s] }))}
          value={f.status}
          onChange={(v) => setF({ status: v.length ? v : null })}
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-9"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <Filter className="size-4" aria-hidden /> Filtros
        </Button>
        <details className="relative">
          <summary
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'h-9 cursor-pointer list-none',
            )}
          >
            <Columns3 className="size-4" aria-hidden /> Colunas
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex min-w-48 flex-col gap-1 rounded-md border border-border-strong bg-surface-2 p-2 shadow-e2">
            {tableColumnIds.map((c: TableColumn) => (
              <label key={c} className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  disabled={c === 'name'}
                  checked={f.cols.includes(c)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...f.cols, c] : f.cols.filter((x) => x !== c);
                    setF({ cols: next.length === tableColumnIds.length ? null : next });
                  }}
                />
                {TABLE_COLUMNS[c]}
              </label>
            ))}
          </div>
        </details>
        {hasFilters && !active && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setSaving(true)}>
            <Save className="size-4" aria-hidden /> Salvar visão
          </Button>
        )}
        <details className="relative">
          <summary
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'h-9 cursor-pointer list-none',
            )}
          >
            <Download className="size-4" aria-hidden /> Exportar
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex min-w-56 flex-col rounded-md border border-border-strong bg-surface-2 p-1 shadow-e2">
            <a className="rounded px-3 py-2 text-body hover:bg-surface-3" href={exportQs(';')}>
              CSV com ponto e vírgula (Excel pt-BR)
            </a>
            <a className="rounded px-3 py-2 text-body hover:bg-surface-3" href={exportQs(',')}>
              CSV com vírgula
            </a>
          </div>
        </details>
        <Link
          href="/leads/importar"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-9')}
        >
          <Upload className="size-4" aria-hidden /> Importar
        </Link>
        <Button size="sm" className="h-9" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> Novo lead
        </Button>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface-1 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Nicho"
            value={f.niche ?? ''}
            onChange={(e) => setF({ niche: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Todos</option>
            {p.niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Região"
            value={f.region ?? ''}
            onChange={(e) => setF({ region: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Todas</option>
            {p.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Faixa de score"
            value={bandValue}
            onChange={(e) =>
              e.target.value === 'high'
                ? band(p.thresholds.green, null)
                : e.target.value === 'mid'
                  ? band(p.thresholds.yellow, p.thresholds.green - 1)
                  : e.target.value === 'low'
                    ? band(null, p.thresholds.yellow - 1)
                    : band(null, null)
            }
          >
            <option value="">Todas</option>
            <option value="high">Alto (≥ {p.thresholds.green})</option>
            <option value="mid">
              Médio ({p.thresholds.yellow}–{p.thresholds.green - 1})
            </option>
            <option value="low">Baixo (&lt; {p.thresholds.yellow})</option>
          </SelectField>
          <div className="flex flex-col gap-1.5">
            <span className="text-label">Situação do site</span>
            <MultiSelect
              label="Escolher"
              options={websiteStatuses.map((s) => ({ value: s, label: siteLabel[s] }))}
              value={f.site}
              onChange={(v) => setF({ site: v.length ? v : null })}
            />
          </div>
          <SelectField
            label="WhatsApp"
            value={f.wa ?? ''}
            onChange={(e) => setF({ wa: (e.target.value || null) as 'yes' | 'no' | null })}
          >
            <option value="">Tanto faz</option>
            <option value="yes">Tem</option>
            <option value="no">Não tem</option>
          </SelectField>
          <SelectField
            label="Não contatar"
            value={f.dnc}
            onChange={(e) => setF({ dnc: e.target.value as 'hide' | 'show' | 'only' })}
          >
            <option value="hide">Ocultar</option>
            <option value="show">Mostrar junto</option>
            <option value="only">Só os marcados</option>
          </SelectField>
          <SelectField
            label="Negociação"
            value={f.deal ?? ''}
            onChange={(e) => setF({ deal: (e.target.value || null) as 'open' | 'none' | null })}
          >
            <option value="">Tanto faz</option>
            <option value="open">Com negociação aberta</option>
            <option value="none">Sem negociação aberta</option>
          </SelectField>
          <SelectField
            label="Origem"
            value={f.source ?? ''}
            onChange={(e) => setF({ source: e.target.value || null })}
          >
            <option value="">Todas</option>
            {p.sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectField>
          <Field
            label="Incluído desde"
            type="date"
            value={f.from ?? ''}
            onChange={(e) => setF({ from: e.target.value || null })}
          />
          <Field
            label="Incluído até"
            type="date"
            value={f.to ?? ''}
            onChange={(e) => setF({ to: e.target.value || null })}
          />
          <label className="flex items-center gap-2 self-end pb-2 text-body">
            <input
              type="checkbox"
              checked={f.overdue}
              onChange={(e) => setF({ overdue: e.target.checked || null })}
            />
            Com lembrete atrasado
          </label>
          {hasFilters && (
            <Link
              href="/leads"
              className="self-end pb-2 text-body text-primary underline-offset-4 hover:underline"
            >
              Limpar filtros
            </Link>
          )}
        </div>
      )}

      <p className="text-label text-text-muted" aria-live="polite">
        {p.total.toLocaleString('pt-BR')} {p.total === 1 ? 'lead' : 'leads'}
      </p>

      <LeadsTable
        key={filterQs + f.sort + f.dir}
        initialRows={p.rows}
        initialCursor={p.cursor}
        qs={filterQs}
        columns={f.cols as TableColumn[]}
        sort={f.sort}
        dir={f.dir}
        onSort={(s) => setF({ sort: s, dir: f.sort === s && f.dir === 'desc' ? 'asc' : 'desc' })}
        onOpen={open}
        loadMore={loadMoreLeads}
        update={updateInline}
      />

      <CreateLeadDialog
        open={creating}
        onClose={() => setCreating(false)}
        niches={p.niches}
        regions={p.regions.map((r) => r.label)}
      />
      <Dialog
        open={saving}
        onClose={() => setSaving(false)}
        title="Salvar visão"
        description="Os filtros atuais viram uma aba."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await saveView(viewName, canon(search));
            if (r.ok) {
              toast.success('Visão salva');
              setSaving(false);
              setViewName('');
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          <Field
            label="Nome"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            maxLength={40}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSaving(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
