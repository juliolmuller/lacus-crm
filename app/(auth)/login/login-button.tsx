'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function LoginButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="lg"
      className="w-full"
      loading={loading}
      disabled={disabled}
      onClick={async () => {
        setLoading(true);
        // redirect em tela cheia (nunca popup), também no app instalado
        const { error } = await authClient.signIn.social({
          provider: 'vercel',
          callbackURL: '/',
          errorCallbackURL: '/login',
        });
        if (error) setLoading(false);
      }}
    >
      Entrar com Vercel
    </Button>
  );
}
