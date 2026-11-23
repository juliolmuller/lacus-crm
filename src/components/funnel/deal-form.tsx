'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { updateDealAction } from '@/app/(app)/funil/actions';
import { Button } from '@/components/ui/button';
import { Field, TextareaField } from '@/components/ui/field';

interface Props {
  deal: {
    expectedCloseOn: null | string;
    notes: null | string;
    probability: null | number;
    serviceType: null | string;
    title: string;
    value: null | string;
  };
  id: string;
}

/**
 * Dados editáveis da negociação (SPEC 6.3).
 */
export function DealForm({ id, deal }: Props): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();

        const fd = new FormData(e.currentTarget);

        start(async () => {
          const r = await updateDealAction(id, fd);

          if (!r.ok) {
            toast.error(r.error);

            return;
          }

          toast.success('Negociação salva');
          router.refresh();
        });
      }}
    >
      <Field
        label="Título"
        name="title"
        defaultValue={deal.title}
        required
        maxLength={200}
        className="sm:col-span-2"
      />
      <Field
        label="Valor (R$)"
        name="value"
        inputMode="decimal"
        defaultValue={
          deal.value ? Number(deal.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''
        }
      />
      <Field
        label="Probabilidade (%)"
        name="probability"
        type="number"
        min={0}
        max={100}
        defaultValue={deal.probability ?? ''}
      />
      <Field
        label="Tipo de serviço"
        name="serviceType"
        defaultValue={deal.serviceType ?? ''}
        maxLength={100}
      />
      <Field
        label="Previsão de fechamento"
        name="expectedCloseOn"
        type="date"
        defaultValue={deal.expectedCloseOn ?? ''}
      />
      <TextareaField
        label="Observações"
        name="notes"
        defaultValue={deal.notes ?? ''}
        className="sm:col-span-2"
      />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={pending}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
