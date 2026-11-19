'use client';

import { useEffect } from 'react';

/** Busca o snapshot offline com o app aberto; o service worker (NetworkFirst) guarda a resposta. */
export function SnapshotWarmer() {
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const warm = () => void fetch('/api/offline/snapshot').catch(() => {});
    // só vale depois que o worker controla a página; antes disso nada seria guardado
    void sw.ready.then(() =>
      sw.controller ? warm() : sw.addEventListener('controllerchange', warm, { once: true }),
    );
    window.addEventListener('online', warm);
    return () => window.removeEventListener('online', warm);
  }, []);
  return null;
}
