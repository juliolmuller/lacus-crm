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

/**
 * Campos de uma interação (formulário rápido e "concluir lembrete"). Leia com
 * `readInteraction`.
 */
export function InteractionFields(): React.JSX.Element {
  const [outcome, setOutcome] = useState('');

  return (
    <>
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
      <SelectField
        label="Resultado"
        name="outcome"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="sm:col-span-2"
      >
        <option value="">Sem resultado definido</option>
        {Object.entries(outcomeLabel).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      {outcome === 'meeting_set' && (
        <Field
          label="Data da reunião"
          name="meetingOn"
          type="date"
          required
          help="Cria o lembrete “Preparar diagnóstico” 1 dia útil antes."
          className="sm:col-span-2"
        />
      )}
      {outcome === 'asked_later' && (
        <Field
          label="Retomar em (dias úteis)"
          name="resumeInDays"
          type="number"
          min={1}
          max={250}
          defaultValue={20}
          className="sm:col-span-2"
        />
      )}
      <Field label="Resumo" name="summary" required maxLength={300} className="sm:col-span-2" />
      <TextareaField label="Detalhes (opcional)" name="body" className="sm:col-span-2" />
    </>
  );
}

export interface InteractionFields {
  body: null | string;
  direction: FormDataEntryValue | null;
  meetingOn: string | undefined;
  outcome: FormDataEntryValue | null;
  resumeInDays: number | undefined;
  summary: FormDataEntryValue | null;
  type: FormDataEntryValue | null;
}

export function readInteraction(f: FormData): InteractionFields {
  const resume = String(f.get('resumeInDays') ?? '');

  return {
    type: f.get('type'),
    direction: f.get('direction'),
    outcome: f.get('outcome') || null,
    summary: f.get('summary'),
    body: String(f.get('body') ?? '').trim() || null,
    meetingOn: String(f.get('meetingOn') ?? '') || undefined,
    resumeInDays: resume ? Number(resume) : undefined,
  };
}

/**
 * Criação rápida de interação (SPEC 6.3). Os efeitos no status e na etapa são
 * do serviço (PLAN D3).
 */
export function InteractionForm({
  leadId,
  disabled,
}: {
  disabled?: boolean;
  leadId: string;
}): React.JSX.Element {
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
          const r = await logInteractionAction({ leadId, ...readInteraction(f) });

          if (!r.ok) {
            toast.error(r.error);

            return;
          }

          toast.success(
            r.reminders
              ? `Interação registrada. ${r.reminders} ${r.reminders === 1 ? 'lembrete criado' : 'lembretes criados'}.`
              : 'Interação registrada',
          );
          setKey((k) => k + 1);
          router.refresh();
        });
      }}
    >
      <InteractionFields />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={pending} disabled={disabled}>
          Registrar interação
        </Button>
      </div>
    </form>
  );
}
