'use client';

import {
  Ban,
  Copy,
  ExternalLink,
  AtSign,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  deleteLeadAction,
  markDoNotContact,
  registerApproachAction,
  setSessionUrl,
} from '@/app/(app)/leads/actions';
import { CreateDealButton } from '@/components/funnel/create-deal-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextareaField } from '@/components/ui/field';
import { instagramUrl, safeUrl, telUrl, whatsappUrl } from '@/lib/leads/links';
import { cn } from '@/lib/utils';

type Props = {
  lead: {
    id: string;
    name: string;
    mapsUrl: string | null;
    phoneE164: string | null;
    instagram: string | null;
    pitch: string | null;
    sessionUrl: string | null;
    doNotContact: boolean;
    hasOpenDeal: boolean;
  };
};

const linkCls = buttonVariants({ variant: 'secondary', size: 'sm' });

function Item({
  href,
  icon,
  children,
}: {
  href: string | null;
  icon: ReactNode;
  children: ReactNode;
}) {
  if (!href)
    return (
      <span aria-disabled className={cn(linkCls, 'opacity-50')}>
        {icon}
        {children}
      </span>
    );
  return (
    <a
      href={href}
      target={href.startsWith('tel:') ? undefined : '_blank'}
      rel="noopener noreferrer"
      className={linkCls}
    >
      {icon}
      {children}
    </a>
  );
}

/** Barra fixa do drawer (SPEC 6.2). Criar lembrete chega na fase 4. */
export function QuickActions({ lead }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<'dnc' | 'delete' | 'session' | null>(null);
  const [reason, setReason] = useState('');
  const [optOut, setOptOut] = useState(true);
  const [typed, setTyped] = useState('');
  const [session, setSession] = useState(lead.sessionUrl ?? '');
  const close = () => setDialog(null);
  const icon = 'size-4';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? 'Erro');
      toast.success(ok);
      close();
      then?.();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Ações rápidas">
      <Item href={safeUrl(lead.mapsUrl)} icon={<MapPin className={icon} aria-hidden />}>
        Maps
      </Item>
      <a
        href={whatsappUrl(lead.phoneE164) ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!lead.phoneE164}
        className={cn(linkCls, !lead.phoneE164 && 'pointer-events-none opacity-50')}
        onClick={() =>
          toast('Abriu o WhatsApp.', {
            duration: 15000,
            action: {
              label: 'Registrar como abordado',
              onClick: () => run(() => registerApproachAction(lead.id), 'Abordagem registrada'),
            },
          })
        }
      >
        <MessageCircle className={icon} aria-hidden />
        WhatsApp
      </a>
      <Item href={instagramUrl(lead.instagram)} icon={<AtSign className={icon} aria-hidden />}>
        Instagram
      </Item>
      <Item href={telUrl(lead.phoneE164)} icon={<Phone className={icon} aria-hidden />}>
        Ligar
      </Item>
      <Button
        variant="secondary"
        size="sm"
        disabled={!lead.pitch}
        onClick={() =>
          navigator.clipboard
            .writeText(lead.pitch ?? '')
            .then(() => toast.success('Argumento copiado'))
        }
      >
        <Copy className={icon} aria-hidden />
        Copiar pitch
      </Button>
      {lead.sessionUrl ? (
        <Item href={safeUrl(lead.sessionUrl)} icon={<Sparkles className={icon} aria-hidden />}>
          Sessão do Claude
        </Item>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setDialog('session')}>
        <ExternalLink className={icon} aria-hidden />
        {lead.sessionUrl ? 'Editar link da sessão' : 'Link da sessão'}
      </Button>
      {!lead.doNotContact && !lead.hasOpenDeal && <CreateDealButton leadId={lead.id} />}
      {!lead.doNotContact && (
        <Button variant="secondary" size="sm" onClick={() => setDialog('dnc')}>
          <Ban className={icon} aria-hidden />
          Não contatar
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDialog('delete')}>
        <Trash2 className={icon} aria-hidden />
        Excluir
      </Button>

      <Dialog
        open={dialog === 'dnc'}
        onClose={close}
        title="Marcar como Não contatar"
        description="Cancela lembretes, move negociações abertas para Perdido e descarta o lead."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => markDoNotContact(lead.id, reason, optOut), 'Lead marcado como Não contatar');
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label">Tipo</legend>
            <label className="flex items-start gap-2 text-body">
              <input
                type="radio"
                name="kind"
                checked={optOut}
                onChange={() => setOptOut(true)}
                className="mt-1"
              />
              <span>
                Pediu para não ser contatado (opt-out)
                <span className="block text-label text-text-muted">
                  Entra na lista de supressão: a rotina não o recadastra.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-body">
              <input
                type="radio"
                name="kind"
                checked={!optOut}
                onChange={() => setOptOut(false)}
                className="mt-1"
              />
              Outro motivo
            </label>
          </fieldset>
          <TextareaField
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            placeholder="Ex.: Recusou por WhatsApp em 18/11"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" loading={pending}>
              Marcar como Não contatar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={close}
        title="Excluir lead"
        description="Apaga o lead, negociações, interações e lembretes. Não dá para desfazer; o lead não será recadastrado pela rotina."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => deleteLeadAction(lead.id, typed),
              'Lead excluído',
              () => router.replace('/leads'),
            );
          }}
        >
          <Field
            label={`Digite "${lead.name}" para confirmar`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={pending}
              disabled={typed.trim() !== lead.name.trim()}
            >
              Excluir definitivamente
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === 'session'} onClose={close} title="Link da sessão do Claude">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setSessionUrl(lead.id, session), 'Link salvo');
          }}
        >
          <Field
            label="URL da sessão"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder="https://claude.ai/share/…"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
