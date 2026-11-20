'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createReminderAction } from '@/app/(app)/lembretes/actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { snoozeLabel, snoozePresets, type SnoozePreset } from '@/lib/followups/snooze';
import { ReminderItem, type ReminderView } from './reminder-item';

/** Lembretes de um lead/negociação (drawers) com criação rápida: título + atalhos de data. */
export function LeadReminders({
  leadId,
  dealId,
  reminders,
  disabled,
}: {
  leadId: string;
  dealId?: string | null;
  reminders: ReminderView[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('Follow-up');
  const [custom, setCustom] = useState('');

  const create = (when: SnoozePreset | { at: string }) =>
    start(async () => {
      const r = await createReminderAction({ leadId, dealId: dealId ?? null, title, when });
      if (!r.ok) return void toast.error(r.error);
      toast.success('Lembrete criado');
      setCustom('');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {reminders.length ? (
        <ul className="flex flex-col gap-2">
          {reminders.map((r) => (
            <ReminderItem key={r.id} r={r} showLead={false} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-muted">Sem lembretes abertos.</p>
      )}
      {!disabled && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
          <Field
            label="Novo lembrete"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <div className="flex flex-wrap items-end gap-2">
            {snoozePresets.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() => create(p)}
              >
                {snoozeLabel[p]}
              </Button>
            ))}
            <Field
              label="Outra data"
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!custom}
              loading={pending}
              onClick={() => create({ at: custom })}
            >
              Criar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
