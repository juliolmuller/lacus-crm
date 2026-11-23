'use client';

import { useEffect } from 'react';

/**
 * Busca o snapshot offline com o app aberto; o service worker (NetworkFirst)
 * guarda a resposta.
 */
export function SnapshotWarmer(): null {
  useEffect(() => {
    const sw = navigator.serviceWorker;

    if (!sw) return;

    const warm = (): void => {
      fetch('/api/offline/snapshot').catch(() => undefined);
    };

    // só vale depois que o worker controla a página; antes disso nada seria guardado
    sw.ready.then(() =>
      sw.controller ? warm() : sw.addEventListener('controllerchange', warm, { once: true }),
    );
    window.addEventListener('online', warm);

    return (): void => {
      window.removeEventListener('online', warm);
      sw.removeEventListener('controllerchange', warm);
    };
  }, []);

  return null;
}
