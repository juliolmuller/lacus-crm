'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { logInteractionAction } from '@/app/(app)/funil/actions';
import { Button } from '@/components/ui/button';
import { Field, SelectField, TextareaField } from '@/components/ui/field';
import {
  directionLabel,
  interactionLabel,
  interactionTypes,
  outcomeLabel,
} from '@/lib/leads/labels';

/** Criação rápida de interação (SPEC 6.3). Os efeitos no status e na etapa são do serviço (PLAN D3). */
export function InteractionForm({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState(0); // zera o formulário depois de salvar

  return (
    <form
      key={key}
      className="grid gap-3 rounded-md border border-border bg-surface-1 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await logInteractionAction({
            leadId,
            type: f.get('type'),
            direction: f.get('direction'),
            outcome: f.get('outcome') || null,
            summary: f.get('summary'),
            body: String(f.get('body') ?? '').trim() || null,
          });
          if (!r.ok) return void toast.error(r.error);
          toast.success('Interação registrada');
          setKey((k) => k + 1);
          router.refresh();
        });
      }}
    >
      <SelectField label="Tipo" name="type" defaultValue="whatsapp">
        {interactionTypes.map((t) => (
          <option key={t} value={t}>
            {interactionLabel[t]}
          </option>
        ))}
      </SelectField>
      <SelectField label="Direção" name="direction" defaultValue="outbound">
        {Object.entries(directionLabel).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <SelectField label="Resultado" name="outcome" defaultValue="" className="sm:col-span-2">
        <option value="">Sem resultado definido</option>
        {Object.entries(outcomeLabel).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <Field label="Resumo" name="summary" required maxLength={300} className="sm:col-span-2" />
      <TextareaField label="Detalhes (opcional)" name="body" className="sm:col-span-2" />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={pending} disabled={disabled}>
          Registrar interação
        </Button>
      </div>
    </form>
  );
}
