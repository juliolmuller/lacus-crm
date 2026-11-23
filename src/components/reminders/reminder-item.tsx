'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  MessageCircle,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  cancelReminderAction,
  completeReminderAction,
  markNoResponseAction,
  snoozeReminderAction,
  syncNowAction,
  updateReminderAction,
} from '@/app/(app)/lembretes/actions';
import { InteractionFields, readInteraction } from '@/components/funnel/interaction-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextareaField } from '@/components/ui/field';
import { spInputValue } from '@/lib/followups/business-days';
import { snoozeLabel, snoozePresets } from '@/lib/followups/snooze';
import { formatWhen } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ReminderView {
  dueAt: string; // ISO
  id: string;
  leadId: string;
  leadName: string;
  notes: null | string;
  /**
   * Venceu antes de agora (calculado no servidor)
   */
  overdue: boolean;
  source: 'manual' | 'mcp' | 'rule';
  status: 'canceled' | 'done' | 'open';
  syncError: null | string;
  syncStatus: 'disabled' | 'error' | 'pending' | 'synced';
  title: string;
  whatsapp: null | string;
}

const sourceLabel = { manual: 'Manual', rule: 'Regra', mcp: 'MCP' } as const;
const syncMeta = {
  synced: {
    Icon: CheckCircle2,
    text: 'Sincronizado com o Google Calendar',
    cls: 'text-success-text',
  },
  pending: { Icon: Clock, text: 'Sincronização pendente', cls: 'text-text-muted' },
  error: { Icon: AlertTriangle, text: 'Erro de sincronização', cls: 'text-danger-text' },
  disabled: { Icon: CloudOff, text: 'Sem Google Calendar conectado', cls: 'text-text-muted' },
} as const;

function SyncIcon({
  status,
  error,
}: {
  error: null | string;
  status: ReminderView['syncStatus'];
}): React.JSX.Element {
  const { Icon, text, cls } = syncMeta[status];
  const label = error ? `${text}: ${error}` : text;

  return (
    <span title={label} className={cn('inline-flex', cls)}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

type Dlg = 'complete' | 'edit' | 'snooze' | null;
const SWIPE = 90;

/**
 * Item de lembrete (lista e drawers). No celular: deslizar → concluir, ← adiar
 * (botões equivalentes sempre visíveis).
 */
export function ReminderItem({
  r,
  showLead = true,
}: {
  r: ReminderView;
  showLead?: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [withInteraction, setWithInteraction] = useState(false);
  const [dx, setDx] = useState(0);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const due = new Date(r.dueAt);
  const open = r.status === 'open';
  const overdue = open && r.overdue;
  const close = (): void => setDlg(null);

  const run = (fn: () => Promise<{ error?: string; ok: boolean }>, ok: string): void =>
    start(async () => {
      const res = await fn();

      if (!res.ok) {
        toast.error(res.error ?? 'Erro');

        return;
      }

      toast.success(ok);
      close();
      router.refresh();
    });

  const complete = (interaction: null | object): void =>
    start(async () => {
      const res = await completeReminderAction(r.id, { interaction });

      if (!res.ok) {
        toast.error(res.error);

        return;
      }

      close();

      if (res.suggestion)
        toast('Último follow-up concluído sem resposta.', {
          duration: 15000,
          action: {
            label: 'Marcar como Sem resposta',
            onClick: () => {
              markNoResponseAction(r.leadId).then(() => router.refresh());
            },
          },
        });
      else
        toast.success(
          res.created ? `Concluído. ${res.created} lembrete(s) novo(s).` : 'Lembrete concluído',
        );

      router.refresh();
    });

  const onTouchEnd = (): void => {
    const moved = dx;
    touchRef.current = null;
    setDx(0);

    if (!open || pending) return;

    if (moved > SWIPE) complete(null);
    else if (moved < -SWIPE)
      run(() => snoozeReminderAction(r.id, 'tomorrow'), 'Adiado para amanhã, 9h30');
  };

  return (
    <li
      className="relative overflow-hidden rounded-md border border-border bg-surface-2"
      data-testid="reminder"
    >
      <div
        className="touch-pan-y p-3"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={(e) =>
          (touchRef.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })
        }
        onTouchMove={(e) => {
          const t = touchRef.current;

          if (!t || !open) return;

          const mx = e.touches[0]!.clientX - t.x;

          if (Math.abs(mx) > Math.abs(e.touches[0]!.clientY - t.y))
            setDx(Math.max(-140, Math.min(140, mx)));
        }}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => setDx(0)}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="text-body font-medium">{r.title}</p>
            {showLead && (
              <Link
                href={`/leads/${r.leadId}`}
                className="text-label text-primary underline-offset-4 hover:underline"
              >
                {r.leadName}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 text-label text-text-muted">
            <span className={cn('tabular', overdue && 'font-semibold text-danger-text')}>
              {overdue && 'Atrasado · '}
              {formatWhen(due)}
            </span>
            <span>· {sourceLabel[r.source]}</span>
            <SyncIcon status={r.syncStatus} error={r.syncError} />
          </div>
        </div>
        {r.notes && <p className="mt-1 text-label text-text-muted">{r.notes}</p>}
        {r.syncStatus === 'error' && (
          <button
            type="button"
            className="mt-1 text-label text-primary underline-offset-4 hover:underline"
            onClick={() =>
              start(async () => {
                const s = await syncNowAction();

                if (s.ok) toast(s.errors ? 'Ainda com erro.' : 'Sincronizado.');

                router.refresh();
              })
            }
          >
            Tentar sincronizar de novo
          </button>
        )}
        {open && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDlg('complete')} loading={pending}>
              <Check className="size-4" aria-hidden />
              Concluir
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDlg('snooze')}>
              <Clock className="size-4" aria-hidden />
              Adiar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDlg('edit')}>
              <Pencil className="size-4" aria-hidden />
              Editar
            </Button>
            {r.whatsapp && (
              <a
                href={r.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-body font-medium hover:bg-surface-3"
              >
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      <Dialog open={dlg === 'complete'} onClose={close} title={`Concluir: ${r.title}`}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            complete(withInteraction ? readInteraction(new FormData(e.currentTarget)) : null);
          }}
        >
          <label className="flex items-center gap-2 text-body sm:col-span-2">
            <input
              type="checkbox"
              checked={withInteraction}
              onChange={(e) => setWithInteraction(e.target.checked)}
            />
            Registrar uma interação junto
          </label>
          {withInteraction && <InteractionFields />}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Concluir
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dlg === 'snooze'} onClose={close} title={`Adiar: ${r.title}`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();

            const at = String(new FormData(e.currentTarget).get('at'));

            run(() => snoozeReminderAction(r.id, { at }), 'Lembrete adiado');
          }}
        >
          <div className="flex flex-wrap gap-2">
            {snoozePresets.map((p) => (
              <Button
                key={p}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => run(() => snoozeReminderAction(r.id, p), 'Lembrete adiado')}
              >
                {snoozeLabel[p]}
              </Button>
            ))}
          </div>
          <Field
            label="Escolher data e hora"
            name="at"
            type="datetime-local"
            required
            defaultValue={spInputValue(due)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Adiar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dlg === 'edit'} onClose={close} title="Editar lembrete">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();

            const f = new FormData(e.currentTarget);

            run(
              () =>
                updateReminderAction(r.id, {
                  title: f.get('title'),
                  notes: f.get('notes') ?? '',
                  at: f.get('at'),
                }),
              'Lembrete atualizado',
            );
          }}
        >
          <Field label="Título" name="title" required defaultValue={r.title} maxLength={200} />
          <Field
            label="Data e hora"
            name="at"
            type="datetime-local"
            required
            defaultValue={spInputValue(due)}
          />
          <TextareaField label="Notas" name="notes" defaultValue={r.notes ?? ''} />
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              className="text-danger-text"
              onClick={() => run(() => cancelReminderAction(r.id), 'Lembrete cancelado')}
            >
              Cancelar lembrete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Fechar
              </Button>
              <Button type="submit" loading={pending}>
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </li>
  );
}
