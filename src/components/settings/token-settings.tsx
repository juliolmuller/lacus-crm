'use client';

import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  createTokenAction,
  revokeConnectorAction,
  revokeTokenAction,
} from '@/app/(app)/configuracoes/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { formatWhen } from '@/lib/format';

export interface TokenRow {
  expired: boolean;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  scopes: string[];
  tokenPrefix: string;
}
export interface ConnectorRow {
  authorizedAt: Date;
  clientId: string;
  name: null | string;
  scopes: string[];
}

const SCOPE_HELP = {
  read: 'Ler leads, negociações e lembretes',
  write: 'Alterar o CRM (inclui ler)',
  prospecting: 'Fila e uso da API (rotina de prospecção)',
} as const;
const EXPIRY = [
  ['30', '30 dias'],
  ['90', '90 dias'],
  ['365', '1 ano'],
  ['', 'Sem validade'],
] as const;

const copy = (text: string): Promise<number | string> =>
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado'),
    () => toast.error('Não foi possível copiar'),
  );

const Snippet = ({ label, code }: { code: string; label: string }): React.JSX.Element => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="text-label text-text-muted">{label}</span>
      <Button size="sm" variant="ghost" onClick={() => copy(code)} aria-label={`Copiar ${label}`}>
        <Copy className="size-4" aria-hidden /> Copiar
      </Button>
    </div>
    <pre
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable code block must be keyboard reachable
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-border bg-surface-1 p-3 text-label"
    >
      {code}
    </pre>
  </div>
);

const BASE = 'https://lacuscrm.juliolmuller.com';

export function TokenSettings({
  tokens,
  connectors,
}: {
  connectors: ConnectorRow[];
  tokens: TokenRow[];
}): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<null | string>(null);
  const [scopes, setScopes] = useState<string[]>(['read']);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4"
        onSubmit={(e) => {
          e.preventDefault();

          const form = e.currentTarget;
          const f = new FormData(form);
          const days = String(f.get('expires'));

          start(async () => {
            const r = await createTokenAction({
              name: String(f.get('name')),
              scopes,
              expiresInDays: days ? Number(days) : null,
            });

            if (!r.ok) {
              toast.error(r.error);

              return;
            }

            setCreated(r.token);
            form.reset();
            router.refresh();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do token" name="name" placeholder="Rotina de prospecção" required />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="token-expires" className="text-label text-text">
              Validade
            </label>
            <select
              id="token-expires"
              name="expires"
              defaultValue="90"
              className="h-10 rounded-md border border-border-strong bg-surface-3 px-3 text-body"
            >
              {EXPIRY.map(([v, l]) => (
                <option key={l} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-label text-text">Escopos</legend>
          {(Object.keys(SCOPE_HELP) as Array<keyof typeof SCOPE_HELP>).map((s) => (
            // eslint-disable-next-line jsx-a11y-x/label-has-associated-control -- the text is the scope name and help rendered inside
            <label key={s} className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) =>
                  setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))
                }
              />
              <span>
                <code>{s}</code> <span className="text-text-muted">{SCOPE_HELP[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Criar token
          </Button>
        </div>
      </form>

      {created && (
        <div
          role="status"
          data-testid="new-token"
          className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4"
        >
          <p className="text-body">Copie agora: este token não será mostrado de novo.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-surface-1 px-2 py-1 text-label">{created}</code>
            <Button size="sm" variant="secondary" onClick={() => copy(created)}>
              <Copy className="size-4" aria-hidden /> Copiar token
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Já copiei
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body">
          <thead className="text-label text-text-muted">
            <tr>
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">Token</th>
              <th className="py-2 pr-3">Escopos</th>
              <th className="py-2 pr-3">Último uso</th>
              <th className="py-2 pr-3">Validade</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="py-2 pr-3">{t.name}</td>
                <td className="py-2 pr-3">
                  <code>{t.tokenPrefix}…</code>
                </td>
                <td className="py-2 pr-3">{t.scopes.join(', ')}</td>
                <td className="py-2 pr-3">{t.lastUsedAt ? formatWhen(t.lastUsedAt) : 'Nunca'}</td>
                <td className="py-2 pr-3">
                  {t.revokedAt ? (
                    <Badge tone="danger">Revogado</Badge>
                  ) : t.expiresAt ? (
                    t.expired ? (
                      <Badge tone="warning">Expirado</Badge>
                    ) : (
                      formatWhen(t.expiresAt)
                    )
                  ) : (
                    'Sem validade'
                  )}
                </td>
                <td className="py-2 text-right">
                  {!t.revokedAt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      aria-label={`Revogar ${t.name}`}
                      onClick={() =>
                        start(async () => {
                          const r = await revokeTokenAction(t.id);

                          if (!r.ok) {
                            toast.error(r.error);

                            return;
                          }

                          toast.success('Token revogado');
                          router.refresh();
                        })
                      }
                    >
                      Revogar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!tokens.length && (
              <tr>
                <td colSpan={6} className="py-3 text-text-muted">
                  Nenhum token criado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-label text-text">Como usar</h3>
        <Snippet
          label="Claude Code"
          code={`claude mcp add --transport http lacus-crm ${BASE}/api/mcp \\\n  --header "Authorization: Bearer $LACUS_CRM_TOKEN"`}
        />
        <Snippet
          label="curl (REST)"
          code={`curl -H "Authorization: Bearer $LACUS_CRM_TOKEN" \\\n  "${BASE}/api/v1/leads?limit=5"`}
        />
        <p className="text-label text-text-muted">
          Referência da API: <code>{BASE}/api/v1/openapi.json</code>. Guia completo em{' '}
          <code>docs/OPERATIONS.md</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label text-text">Conectores autorizados (OAuth)</h3>
        {connectors.length ? (
          <ul className="flex flex-col gap-2">
            {connectors.map((c) => (
              <li
                key={c.clientId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <span className="text-body">
                  {c.name ?? c.clientId}{' '}
                  <span className="text-text-muted">
                    · {c.scopes.join(', ')} · desde {formatWhen(c.authorizedAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  aria-label={`Revogar conector ${c.name ?? c.clientId}`}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeConnectorAction(c.clientId);

                      if (!r.ok) {
                        toast.error(r.error);

                        return;
                      }

                      toast.success('Conector revogado');
                      router.refresh();
                    })
                  }
                >
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-muted">
            Nenhum conector autorizado. Os conectores do claude.ai aparecem aqui depois do primeiro
            acesso (veja docs/ROTINA.md).
          </p>
        )}
      </div>
    </div>
  );
}
