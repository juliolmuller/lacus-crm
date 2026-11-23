'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  disconnectGoogleAction,
  resyncGoogleAction,
  saveCalendarDefaultsAction,
} from '@/app/(app)/configuracoes/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

interface Props {
  available: boolean;
  configured: boolean;
  email: null | string;
  errors: number;
  flash: null | string;
  lastError: null | string;
  pending: number;
  popupMinutes: number[];
  status: 'active' | 'needs_reauth' | 'revoked' | null;
}

const flashText: Record<string, [boolean, string]> = {
  connected: [true, 'Google Calendar conectado.'],
  denied: [false, 'Você cancelou a autorização no Google.'],
  invalid: [false, 'A conexão expirou ou foi inválida. Tente de novo.'],
  scope: [false, 'Faltou a permissão de calendário. Marque a opção ao autorizar.'],
  error: [false, 'Não foi possível concluir a conexão. Tente de novo.'],
  preview: [false, 'Disponível apenas em produção.'],
  not_configured: [false, 'Credenciais do Google ainda não configuradas (veja docs/GOOGLE.md).'],
};

export function GoogleSettings(p: Props): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const connected = p.status === 'active' || p.status === 'needs_reauth';
  const f = p.flash ? flashText[p.flash] : null;

  return (
    <div className="flex flex-col gap-4">
      {f && (
        <p
          role="status"
          className={f[0] ? 'text-body text-success-text' : 'text-body text-danger-text'}
        >
          {f[1]}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-body">
        Status:
        {p.status === 'active' && (
          <Badge tone="success">Conectado{p.email ? ` (${p.email})` : ''}</Badge>
        )}
        {p.status === 'needs_reauth' && <Badge tone="danger">Precisa reconectar</Badge>}
        {!connected && <Badge>Desconectado</Badge>}
        {connected && (
          <span className="text-text-muted">
            Calendário: Lacus CRM – Follow-ups · {p.pending} pendente(s) · {p.errors} com erro
          </span>
        )}
      </div>
      {p.lastError && <p className="text-label text-danger-text">{p.lastError}</p>}

      {!p.available ? (
        <p className="text-body text-text-muted">
          Disponível apenas em produção (a conexão com o Google usa endereços de retorno fixos).
        </p>
      ) : !p.configured ? (
        <p className="text-body text-text-muted">
          As credenciais do Google ainda não estão configuradas. O passo a passo está em{' '}
          <code>docs/GOOGLE.md</code>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {/* rota que redireciona ao Google: precisa ser navegação completa, não <Link> */}
          <a
            href="/api/google/connect"
            className={buttonVariants({
              variant: p.status === 'active' ? 'secondary' : 'primary',
              size: 'sm',
            })}
          >
            {connected ? 'Reconectar' : 'Conectar Google Calendar'}
          </a>
          {p.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await resyncGoogleAction();

                  if (!r.ok) {
                    toast.error(r.error);

                    return;
                  }

                  toast.success(
                    `Re-sincronizado: ${r.synced} atualizado(s), ${r.deleted} removido(s), ${r.errors} erro(s).`,
                  );
                  router.refresh();
                })
              }
            >
              Re-sincronizar tudo
            </Button>
          )}
          {connected && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-text"
              loading={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    'Desconectar o Google Calendar? Os eventos já criados continuam no seu calendário.',
                  )
                )
                  return;

                start(async () => {
                  const r = await disconnectGoogleAction();

                  if (!r.ok) {
                    toast.error(r.error);

                    return;
                  }

                  toast.success('Desconectado');
                  router.refresh();
                });
              }}
            >
              Desconectar
            </Button>
          )}
        </div>
      )}

      <form
        className="flex max-w-sm flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();

          const mins = String(new FormData(e.currentTarget).get('minutes'))
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .map(Number);

          if (mins.some((m) => !Number.isInteger(m) || m < 0))
            toast.error('Use minutos inteiros separados por vírgula');

          return;

          start(async () => {
            const r = await saveCalendarDefaultsAction(mins);

            if (!r.ok) {
              toast.error(r.error);

              return;
            }

            toast.success('Lembretes padrão salvos');
            router.refresh();
          });
        }}
      >
        <Field
          label="Avisos do Calendar (minutos antes)"
          name="minutes"
          defaultValue={p.popupMinutes.join(', ')}
          help="Ex.: 10, 0 avisa 10 minutos antes e na hora. Vale para eventos novos ou atualizados."
        />
        <div>
          <Button type="submit" size="sm" variant="secondary" loading={pending}>
            Salvar avisos
          </Button>
        </div>
      </form>
    </div>
  );
}
