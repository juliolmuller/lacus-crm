import { type Metadata } from 'next';
import { headers } from 'next/headers';

import { Logo } from '@/components/brand/logo';
import { getAuth } from '@/lib/auth/auth';
import { requireOwner } from '@/lib/auth/dal';

import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Autorizar acesso' };

const SCOPE_TEXT: Record<string, string> = {
  read: 'Ler leads, negociações, lembretes e o painel',
  write: 'Criar e alterar leads, interações, negociações e lembretes',
  prospecting: 'Usar a fila de prospecção e registrar o uso da API (rotina)',
  offline_access: 'Manter a conexão sem pedir login de novo',
};

type SearchParams = Promise<{ client_id?: string; scope?: string }>;

/**
 * Tela de consentimento do OAuth do MCP (PLAN D1): só o dono (requireOwner)
 * chega até aqui.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  await requireOwner();

  const { client_id, scope } = await searchParams;
  const client = client_id
    ? await getAuth()
        .api.getOAuthClientPublic({ query: { client_id }, headers: await headers() })
        .catch(() => null)
    : null;
  const scopes = (scope ?? '').split(' ').filter(Boolean);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-surface-1 p-8 shadow-e2">
        <Logo variant="lockup" size={36} />
        <h1 className="text-section">Autorizar acesso</h1>
        <p className="text-body text-text-muted">
          <strong className="text-text">
            {client?.client_name ?? client_id ?? 'Um aplicativo'}
          </strong>{' '}
          quer acessar o Lacus CRM como você, com estas permissões:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body">
          {scopes.map((s) => (
            <li key={s}>{SCOPE_TEXT[s] ?? s}</li>
          ))}
        </ul>
        <ConsentForm scope={scope ?? ''} />
      </div>
    </main>
  );
}
