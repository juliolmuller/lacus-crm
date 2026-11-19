'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteTemplateAction, saveTemplateAction } from '@/app/(app)/configuracoes/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField, TextareaField } from '@/components/ui/field';
import { renderTemplate, templateValues, templateVars } from '@/lib/followups/templates';
import type { WebsiteStatus } from '@/lib/leads/labels';
import type { TemplateInput } from '@/lib/services/followup-settings';

export type TemplateRowView = TemplateInput & { id: number };
export type PreviewLead = {
  id: string;
  name: string;
  mapsRating: string | null;
  mapsReviews: number | null;
  websiteStatus: WebsiteStatus | null;
  pitch: string | null;
  niche: string;
  city: string;
  neighborhood: string | null;
};

const blank: TemplateInput = { key: '', name: '', channel: 'whatsapp', body: '', active: true };

/** Prévia com um lead escolhido: variáveis faltando ficam visíveis e bloqueiam o envio. */
function Preview({
  body,
  leads,
  profile,
}: {
  body: string;
  leads: PreviewLead[];
  profile: { name?: string; portfolioUrl?: string };
}) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return <p className="text-label text-text-muted">Sem leads para a prévia.</p>;
  const m = renderTemplate(
    body,
    templateValues(
      lead,
      { name: lead.niche },
      { city: lead.city, neighborhood: lead.neighborhood },
      profile,
    ),
  );
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
      <SelectField
        label="Prévia com o lead"
        value={leadId}
        onChange={(e) => setLeadId(e.target.value)}
      >
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </SelectField>
      <p
        className="whitespace-pre-line rounded-md bg-surface-3 p-3 text-body"
        data-testid="template-preview"
      >
        {m.text || 'Escreva a mensagem para ver a prévia.'}
      </p>
      {m.blocked && (
        <p role="status" className="text-label text-warning-text">
          Faltam dados: {m.missing.join(', ')}. Com isso, “Abrir WhatsApp” fica bloqueado para este
          lead.
        </p>
      )}
    </div>
  );
}

export function TemplateSettings({
  templates,
  leads,
  profile,
}: {
  templates: TemplateRowView[];
  leads: PreviewLead[];
  profile: { name?: string; portfolioUrl?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: number | null; t: TemplateInput } | null>(null);
  const t = editing?.t;
  const set = (patch: Partial<TemplateInput>) =>
    setEditing((e) => e && { ...e, t: { ...e.t, ...patch } });
  const done = (ok: string) => {
    toast.success(ok);
    setEditing(null);
    router.refresh();
  };
  const insert = (v: string) => {
    const el = document.getElementById('template-body') as HTMLTextAreaElement | null;
    const text = `{{${v}}}`;
    if (!el || !t) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    set({ body: t.body.slice(0, a) + text + t.body.slice(b) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + text.length, a + text.length);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {templates.map((x) => (
          <li
            key={x.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface-2 p-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-body font-medium">
                {x.name}
                <Badge tone={x.active ? 'success' : 'neutral'}>
                  {x.active ? 'Ativo' : 'Desativado'}
                </Badge>
              </p>
              <p className="line-clamp-2 text-label text-text-muted">{x.body}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing({ id: x.id, t: { ...x } })}
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
          onClick={() => setEditing({ id: null, t: { ...blank } })}
        >
          <Plus className="size-4" aria-hidden />
          Novo modelo
        </Button>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar modelo' : 'Novo modelo'}
      >
        {t && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await saveTemplateAction(editing!.id, t);
                if (!res.ok) return void toast.error(res.error);
                done('Modelo salvo');
              });
            }}
          >
            <Field
              label="Nome"
              value={t.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Chave"
                value={t.key}
                onChange={(e) => set({ key: e.target.value })}
                readOnly={!!editing?.id}
                required
                help="Usada pelas regras de follow-up (ex.: followup_1)."
              />
              <SelectField
                label="Canal"
                value={t.channel}
                onChange={(e) => set({ channel: e.target.value as TemplateInput['channel'] })}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="instagram">Instagram</option>
              </SelectField>
            </div>
            <div className="flex flex-col gap-1.5">
              <TextareaField
                id="template-body"
                label="Mensagem"
                value={t.body}
                onChange={(e) => set({ body: e.target.value })}
                required
                rows={6}
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Inserir variável">
                {templateVars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insert(v)}
                    className="rounded-md border border-border-strong bg-surface-3 px-2 py-0.5 text-label hover:bg-surface-2"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={t.active}
                onChange={(e) => set({ active: e.target.checked })}
              />
              Ativo
            </label>
            <Preview body={t.body} leads={leads} profile={profile} />
            <div className="flex justify-between gap-2">
              {editing?.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger-text"
                  onClick={() => {
                    if (!window.confirm('Excluir este modelo?')) return;
                    start(async () => {
                      const res = await deleteTemplateAction(editing.id!);
                      if (!res.ok) return void toast.error(res.error);
                      done('Modelo excluído');
                    });
                  }}
                >
                  Excluir
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
