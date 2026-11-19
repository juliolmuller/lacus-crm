'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function LogoutButton({ iconOnly }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="lg"
      loading={loading}
      aria-label="Sair"
      title="Sair"
      className="w-full justify-start"
      onClick={async () => {
        setLoading(true);
        await authClient.signOut(); // revoga a sessão no banco
        // o service worker apaga os caches de runtime (snapshot com dados do usuário)
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
        router.replace('/login');
      }}
    >
      {!loading && <LogOut className="size-4" aria-hidden />}
      {!iconOnly && 'Sair'}
    </Button>
  );
}
