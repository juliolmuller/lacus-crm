'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { loseDealAction, winDealAction } from '@/app/(app)/funil/actions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField, TextareaField } from '@/components/ui/field';
import { lossReasons } from '@/lib/funnel/status-sync';

export type Closing = { dealId: string; title: string; kind: 'won' | 'lost'; value: string | null };

const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** Ganho (valor final + data) e Perdido (motivo + texto): obrigatórios ao soltar nessas colunas. */
export function CloseDialogs({
  closing,
  onClose,
  onDone,
}: {
  closing: Closing | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  if (!closing) return null; // o estado dos campos nasce a cada abertura

  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn().catch(() => ({ ok: false, error: 'Sem conexão. Tente de novo.' }));
      if (!r.ok) return void toast.error(r.error ?? 'Erro');
      toast.success(ok);
      onDone();
    });

  return closing.kind === 'won' ? (
    <Dialog open onClose={onClose} title="Negociação ganha" description={closing.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit(
            () => winDealAction(closing.dealId, String(f.get('value')), String(f.get('date'))),
            'Negociação ganha. O lead virou cliente.',
          );
        }}
      >
        <Field
          label="Valor final (R$)"
          name="value"
          defaultValue={
            closing.value
              ? Number(closing.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
              : ''
          }
          inputMode="decimal"
          required
        />
        <Field label="Data do fechamento" name="date" type="date" defaultValue={today()} required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Confirmar ganho
          </Button>
        </div>
      </form>
    </Dialog>
  ) : (
    <Dialog open onClose={onClose} title="Negociação perdida" description={closing.title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit(
            () => loseDealAction(closing.dealId, reason, String(f.get('note'))),
            'Negociação marcada como perdida',
          );
        }}
      >
        <SelectField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        >
          <option value="" disabled>
            Escolha…
          </option>
          {lossReasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
        {reason === 'Não contatar' && (
          <p role="note" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-body">
            O lead será marcado como Não contatar: lembretes cancelados, negociações abertas
            perdidas e entrada na lista de supressão.
          </p>
        )}
        <TextareaField label="Detalhes (opcional)" name="note" maxLength={500} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" loading={pending} disabled={!reason}>
            Confirmar perda
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
