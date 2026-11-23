'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteRuleAction, saveRuleAction } from '@/app/(app)/configuracoes/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/ui/field';
import { addBusinessDays, type BusinessCalendar } from '@/lib/followups/business-days';
import {
  directionLabel,
  interactionLabel,
  interactionTypes,
  outcomeLabel,
} from '@/lib/leads/labels';
import type { RuleInput } from '@/lib/services/followup-settings';

export type RuleRowView = RuleInput & { id: number };
type Step = RuleInput['cadence'][number];

const triggerLabel = {
  deal_created: 'Negociação criada',
  deal_stage_entered: 'Entrou numa etapa',
  interaction_logged: 'Interação registrada',
} as const;

const blank: RuleInput = {
  name: '',
  active: true,
  trigger: 'interaction_logged',
  stageId: null,
  interactionOutcome: null,
  interactionDirection: null,
  interactionType: null,
  cadence: [{ offsetBusinessDays: 2, time: '09:30', title: 'Follow-up' }],
  cancelOn: { inboundInteraction: true, stageLeft: true },
};

const weekday = (ymd: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${ymd}T12:00:00Z`));

const offsetText = (n: number) => (n < 0 ? `${-n} d.u. antes da data` : `+${n} d.u.`);

/** Simulador: datas que a cadência geraria a partir de uma data, com feriados e fins de semana. */
function Simulator({
  cadence,
  calendar,
  today,
}: {
  cadence: Step[];
  calendar: BusinessCalendar;
  today: string;
}) {
  const [base, setBase] = useState(today);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
      <Field
        label="Simulador: se o gatilho (ou a data da reunião) for em"
        type="date"
        value={base}
        onChange={(e) => setBase(e.target.value)}
      />
      {base && (
        <ol className="flex flex-col gap-1 text-body" aria-label="Datas simuladas">
          {cadence.map((s, i) => (
            <li key={i}>
              <span className="text-text-muted">{s.title || `Passo ${i + 1}`}:</span>{' '}
              {weekday(addBusinessDays(base, s.offsetBusinessDays, calendar))} às {s.time}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FollowupSettings({
  rules,
  stages,
  templates,
  calendar,
  today,
}: {
  rules: RuleRowView[];
  stages: { id: number; name: string }[];
  templates: { key: string; name: string }[];
  calendar: BusinessCalendar;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: number | null; rule: RuleInput } | null>(null);
  const r = editing?.rule;
  const set = (patch: Partial<RuleInput>) =>
    setEditing((e) => e && { ...e, rule: { ...e.rule, ...patch } });
  const setStep = (i: number, patch: Partial<Step>) =>
    set({ cadence: r!.cadence.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const done = (ok: string) => {
    toast.success(ok);
    setEditing(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rules.map((x) => (
          <li
            key={x.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface-2 p-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-body font-medium">
                {x.name}
                <Badge tone={x.active ? 'success' : 'neutral'}>
                  {x.active ? 'Ativa' : 'Desativada'}
                </Badge>
              </p>
              <p className="text-label text-text-muted">
                {triggerLabel[x.trigger]} ·{' '}
                {x.cadence.map((s) => `${offsetText(s.offsetBusinessDays)} ${s.time}`).join(', ')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing({ id: x.id, rule: structuredClone(x) })}
            >
              Editar
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing({ id: null, rule: structuredClone(blank) })}
        >
          <Plus className="size-4" aria-hidden />
          Nova regra
        </Button>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar regra' : 'Nova regra'}
        wide
        description="Regras criam lembretes (e eventos no Calendar). Nunca enviam mensagens."
      >
        {r && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await saveRuleAction(editing!.id, r);
                if (!res.ok) return void toast.error(res.error);
                done('Regra salva');
              });
            }}
          >
            <Field
              label="Nome"
              value={r.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
            <label className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={r.active}
                onChange={(e) => set({ active: e.target.checked })}
              />
              Ativa
            </label>
            <SelectField
              label="Gatilho"
              value={r.trigger}
              onChange={(e) => set({ trigger: e.target.value as RuleInput['trigger'] })}
            >
              {Object.entries(triggerLabel).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            {r.trigger === 'interaction_logged' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label="Direção"
                  value={r.interactionDirection ?? ''}
                  onChange={(e) =>
                    set({
                      interactionDirection: (e.target.value ||
                        null) as RuleInput['interactionDirection'],
                    })
                  }
                >
                  <option value="">Qualquer</option>
                  {Object.entries(directionLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Tipo"
                  value={r.interactionType ?? ''}
                  onChange={(e) =>
                    set({
                      interactionType: (e.target.value || null) as RuleInput['interactionType'],
                    })
                  }
                >
                  <option value="">Qualquer</option>
                  {interactionTypes.map((t) => (
                    <option key={t} value={t}>
                      {interactionLabel[t]}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Resultado"
                  value={r.interactionOutcome ?? ''}
                  onChange={(e) => set({ interactionOutcome: e.target.value || null })}
                >
                  <option value="">Qualquer</option>
                  {Object.entries(outcomeLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : (
              <SelectField
                label="Etapa"
                value={r.stageId ?? ''}
                onChange={(e) => set({ stageId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Qualquer etapa</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-label">
                Cadência (dias úteis; negativo = antes de uma data informada)
              </legend>
              {r.cadence.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[5rem_6rem_minmax(0,1fr)] items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[5rem_6rem_minmax(0,1fr)_9rem_auto]"
                >
                  <Field
                    label="Dias úteis"
                    type="number"
                    value={s.offsetBusinessDays}
                    onChange={(e) => setStep(i, { offsetBusinessDays: Number(e.target.value) })}
                  />
                  <Field
                    label="Hora"
                    type="time"
                    value={s.time}
                    onChange={(e) => setStep(i, { time: e.target.value })}
                    required
                  />
                  <Field
                    label="Título"
                    value={s.title}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    required
                  />
                  <SelectField
                    label="Modelo"
                    value={s.templateKey ?? ''}
                    onChange={(e) => setStep(i, { templateKey: e.target.value || undefined })}
                  >
                    <option value="">Nenhum</option>
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover passo ${i + 1}`}
                    disabled={r.cadence.length === 1}
                    onClick={() => set({ cadence: r.cadence.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                  {i === r.cadence.length - 1 && (
                    <label className="col-span-full flex items-center gap-2 text-label text-text-muted">
                      <input
                        type="checkbox"
                        checked={s.suggestStatus === 'no_response'}
                        onChange={(e) =>
                          setStep(i, {
                            suggestStatus: e.target.checked ? 'no_response' : undefined,
                          })
                        }
                      />
                      Ao concluir este passo sem resposta, sugerir o status “Sem resposta”
                    </label>
                  )}
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    set({
                      cadence: [
                        ...r.cadence,
                        { offsetBusinessDays: 5, time: '09:30', title: 'Follow-up' },
                      ],
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar passo
                </Button>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-label">Cancela os pendentes quando</legend>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={!!r.cancelOn.inboundInteraction}
                  onChange={(e) =>
                    set({ cancelOn: { ...r.cancelOn, inboundInteraction: e.target.checked } })
                  }
                />
                Chegar uma interação recebida
              </label>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={!!r.cancelOn.stageLeft}
                  onChange={(e) =>
                    set({ cancelOn: { ...r.cancelOn, stageLeft: e.target.checked } })
                  }
                />
                A negociação mudar de etapa
              </label>
            </fieldset>

            <Simulator cadence={r.cadence} calendar={calendar} today={today} />

            <div className="flex justify-between gap-2">
              {editing?.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger-text"
                  onClick={() => {
                    if (!window.confirm('Excluir esta regra? Os lembretes já criados continuam.'))
                      return;
                    start(async () => {
                      const res = await deleteRuleAction(editing.id!);
                      if (!res.ok) return void toast.error(res.error);
                      done('Regra excluída');
                    });
                  }}
                >
                  Excluir regra
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={pending}>
                  Salvar
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
