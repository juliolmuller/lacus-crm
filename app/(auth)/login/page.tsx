import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Copyright } from '@/components/brand/copyright';
import { Logo } from '@/components/brand/logo';
import { getSession } from '@/lib/auth/dal';
import { getEnv } from '@/lib/env';
import { LoginButton } from './login-button';

export const metadata: Metadata = { title: 'Entrar' };

type SearchParams = Promise<{ error?: string; error_description?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, error_description } = await searchParams;
  // Com `error` presente a sessão pode existir mas não ser do dono; nesse caso não redireciona.
  if (!error && (await getSession())) redirect('/');

  const dev = process.env.NODE_ENV !== 'production';
  const configured = !!getEnv().VERCEL_CLIENT_ID;
  // Em produção só "Acesso negado"; em dev mostra a descrição (inclui o sub recebido).
  const message = error ? (dev && error_description ? error_description : 'Acesso negado') : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 pt-[max(1rem,var(--safe-top))]">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-border bg-surface-1 p-8 shadow-e2">
        <Logo variant="lockup" size={40} />
        <h1 className="text-section">Entrar</h1>
        {message && (
          <p
            role="alert"
            className="w-full rounded-md border border-danger/40 bg-danger/10 p-3 text-body text-danger"
          >
            {message}
          </p>
        )}
        {dev && !configured && (
          <p className="w-full rounded-md border border-warning/40 bg-warning/10 p-3 text-label text-warning">
            Dev: preencha VERCEL_CLIENT_ID e VERCEL_CLIENT_SECRET no .env.local (veja o README).
          </p>
        )}
        <LoginButton disabled={!configured} />
      </div>
      <Copyright />
    </main>
  );
}
