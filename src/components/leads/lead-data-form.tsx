'use client';

import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { toast } from 'sonner';

import { updateLeadAction } from '@/app/(app)/leads/actions';
import { Button } from '@/components/ui/button';
import { Field, SelectField, TextareaField } from '@/components/ui/field';
import { COLUMNS } from '@/lib/leads/csv';
import { contactStatuses, siteLabel, statusLabel, websiteStatuses } from '@/lib/leads/labels';

interface Props {
  niches: string[];
  origin: Array<{ label: string; value: string }>;
  regions: string[];
  /**
   * Cabeçalho da planilha → valor (o mesmo formato da exportação).
   */
  row: Record<string, string>;
}

/**
 * Aba Dados: os 39 campos editáveis. A conversão no servidor é a mesma da
 * importação CSV.
 */
export function LeadDataForm({ row, niches, regions, origin }: Props): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const listId = useId();
  const readOnly = new Set(['id', 'score', 'ticket']);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();

        const fd = new FormData(e.currentTarget);

        start(async () => {
          const r = await updateLeadAction(row['ID']!, fd);

          if (r.ok) {
            toast.success('Lead salvo');
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {COLUMNS.map((c) => {
          const v = row[c.header] ?? '';
          const common = { name: c.header, label: c.header, defaultValue: v };

          if (readOnly.has(c.kind))
            return (
              <Field key={c.header} label={c.header} defaultValue={v} readOnly tabIndex={-1} />
            );

          switch (c.kind) {
            case 'bool':
              return (
                <SelectField key={c.header} {...common}>
                  <option value="">Não</option>
                  <option>Sim</option>
                </SelectField>
              );
            case 'boolNull':
              return (
                <SelectField key={c.header} {...common}>
                  <option value="">Não informado</option>
                  <option>Sim</option>
                  <option>Não</option>
                </SelectField>
              );
            case 'date':
            case 'datetime':
              return <Field key={c.header} {...common} placeholder="dd/mm/aaaa" />;
            case 'int':
              return <Field key={c.header} {...common} inputMode="numeric" />;
            case 'long':
              return <TextareaField key={c.header} {...common} className="sm:col-span-2" />;
            case 'money':
            case 'rating':
              return <Field key={c.header} {...common} inputMode="decimal" />;
            case 'niche':
              return (
                <SelectField key={c.header} {...common}>
                  {niches.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </SelectField>
              );
            case 'place':
              return <Field key={c.header} {...common} list={listId} help="Bairro, Cidade/UF" />;
            case 'site':
              return (
                <SelectField key={c.header} {...common}>
                  {websiteStatuses.map((s) => (
                    <option key={s} value={s === 'unknown' ? '' : siteLabel[s]}>
                      {siteLabel[s]}
                    </option>
                  ))}
                </SelectField>
              );
            case 'status':
              return (
                <SelectField key={c.header} {...common}>
                  {contactStatuses.map((s) => (
                    <option key={s}>{statusLabel[s]}</option>
                  ))}
                </SelectField>
              );
            default:
              return <Field key={c.header} {...common} />;
          }
        })}
      </div>
      <datalist id={listId}>
        {regions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-border bg-surface-2 p-3 text-body sm:grid-cols-2">
        {origin.map((o) => (
          <div key={o.label} className="flex justify-between gap-3">
            <dt className="text-text-muted">{o.label}</dt>
            <dd className="min-w-0 truncate text-right">{o.value || '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="sticky bottom-0 flex justify-end border-t border-border bg-surface-1 py-3">
        <Button type="submit" loading={pending}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
