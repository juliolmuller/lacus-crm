'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function ConsentForm({ scope }: { scope: string }) {
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setBusy(accept ? 'allow' : 'deny');
    const { data, error } = await authClient.oauth2.consent({
      accept,
      scope: accept ? scope : undefined,
    });
    if (error || !data?.url) {
      setBusy(null);
      setError('Não foi possível concluir. Volte ao aplicativo e tente de novo.');
      return;
    }
    window.location.href = data.url; // redirect em tela cheia, também no app instalado
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-body text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          loading={busy === 'allow'}
          disabled={!!busy}
          onClick={() => answer(true)}
        >
          Permitir
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          loading={busy === 'deny'}
          disabled={!!busy}
          onClick={() => answer(false)}
        >
          Negar
        </Button>
      </div>
    </div>
  );
}
