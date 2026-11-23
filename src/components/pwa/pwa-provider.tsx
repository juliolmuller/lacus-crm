'use client';

import { SerwistProvider, useSerwist } from '@serwist/turbopack/react';
import { type ReactNode, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Avisa quando há service worker novo esperando; "Atualizar" ativa e recarrega.
 */
function UpdateToast(): null {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist) return;

    const show = (): number | string =>
      toast('Nova versão disponível', {
        id: 'sw-update',
        duration: Infinity,
        action: {
          label: 'Atualizar',
          onClick: () => {
            // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener -- the page reloads as soon as it fires
            serwist.addEventListener('controlling', () => location.reload());
            serwist.messageSkipWaiting();
          },
        },
      });

    serwist.addEventListener('waiting', show);

    return (): void => serwist.removeEventListener('waiting', show);
  }, [serwist]);

  return null;
}

/**
 * Registra o service worker (só em produção). `cacheOnNavigation` fica
 * desligado de propósito: ele guardaria HTML autenticado. `reloadOnOnline`
 * também, para não perder o que está sendo digitado.
 */
export function PwaProvider({ children }: { children: ReactNode }): React.JSX.Element {
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
