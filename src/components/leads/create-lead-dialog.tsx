'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createLeadAction } from '@/app/(app)/leads/actions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/ui/field';
import { siteLabel, websiteStatuses } from '@/lib/leads/labels';

interface Dup {
  id: string;
  name: string;
  reasons: string[];
  regionLabel: string;
}

/**
 * SPEC 6.2: validação no servidor, checagem de duplicata antes de salvar e
 * "Abrir existente".
 */
export function CreateLeadDialog({
  open,
  onClose,
  niches,
  regions,
}: {
  niches: Array<{ id: number; name: string }>;
  onClose: () => void;
  open: boolean;
  regions: string[];
}): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [dups, setDups] = useState<Dup[]>();
  const [data, setData] = useState<FormData>();
  const listId = useId();

  const submit = (fd: FormData, force: boolean): void =>
    start(async () => {
      const r = await createLeadAction(fd, force);

      if (r.ok) {
        toast.success('Lead criado');
        onClose();
        setDups(undefined);
        router.push(`/leads?lead=${r.id}`);

        return;
      }

      setError(r.error);
      setDups(r.duplicates);
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo lead"
      description="Nome, nicho e região são obrigatórios."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();

          const fd = new FormData(e.currentTarget);

          setData(fd);
          setError(undefined);
          setDups(undefined);
          submit(fd, false);
        }}
      >
        <Field name="Nome do negócio" label="Nome do negócio" required />
        <SelectField name="Nicho" label="Nicho" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {niches.map((n) => (
            <option key={n.id}>{n.name}</option>
          ))}
        </SelectField>
        <Field
          name="Cidade / bairro"
          label="Cidade / bairro"
          required
          placeholder="Xaxim, Curitiba/PR"
          list={listId}
          help="Formato: Bairro, Cidade/UF. A região é criada se ainda não existir."
        />
        <datalist id={listId}>
          {regions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="Telefone" label="Telefone" inputMode="tel" placeholder="(41) 99999-0000" />
          <SelectField name="WhatsApp" label="WhatsApp" defaultValue="">
            <option value="">Não</option>
            <option>Sim</option>
          </SelectField>
          <Field name="Instagram" label="Instagram" placeholder="@perfil" />
          <Field name="Site atual" label="Site atual" />
          <SelectField
            name="Situação do site"
            label="Situação do site"
            defaultValue={siteLabel.unknown}
          >
            {websiteStatuses.map((s) => (
              <option key={s} value={siteLabel[s]}>
                {siteLabel[s]}
              </option>
            ))}
          </SelectField>
          <Field name="E-mail" label="E-mail" type="email" />
          <Field name="Nota no Maps" label="Nota no Maps" inputMode="decimal" placeholder="4,5" />
          <Field name="Nº de avaliações no Maps" label="Avaliações no Maps" inputMode="numeric" />
        </div>
        {error && (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        )}
        {dups && (
          <ul
            aria-label="Leads parecidos"
            className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3"
          >
            {dups.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 text-body"
              >
                <span>
                  <strong>{d.name}</strong> · {d.regionLabel} ({d.reasons.join(', ')})
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    router.push(`/leads?lead=${d.id}`);
                  }}
                >
                  Abrir existente
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {dups && data && (
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              onClick={() => submit(data, true)}
            >
              Criar mesmo assim
            </Button>
          )}
          <Button type="submit" loading={pending}>
            Criar lead
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
