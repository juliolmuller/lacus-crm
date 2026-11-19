'use client';

import { SerwistProvider, useSerwist } from '@serwist/turbopack/react';
import { useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';

/** Avisa quando há service worker novo esperando; "Atualizar" ativa e recarrega. */
function UpdateToast() {
  const { serwist } = useSerwist();
  useEffect(() => {
    if (!serwist) return;
    const show = () =>
      toast('Nova versão disponível', {
        id: 'sw-update',
        duration: Infinity,
        action: {
          label: 'Atualizar',
          onClick: () => {
            serwist.addEventListener('controlling', () => location.reload());
            serwist.messageSkipWaiting();
          },
        },
      });
    serwist.addEventListener('waiting', show);
    return () => serwist.removeEventListener('waiting', show);
  }, [serwist]);
  return null;
}

/**
 * Registra o service worker (só em produção). `cacheOnNavigation` fica desligado de propósito:
 * ele guardaria HTML autenticado. `reloadOnOnline` também, para não perder o que está sendo digitado.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== 'production'}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      <UpdateToast />
      {children}
    </SerwistProvider>
  );
}
