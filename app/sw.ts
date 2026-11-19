import { NetworkFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';
import { cacheableAtRuntime, neverCache } from '../lib/pwa/cache-rules';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const SNAPSHOT_CACHE = 'offline-snapshot';

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // sem skipWaiting: o toast "Nova versão disponível" manda SKIP_WAITING quando o usuário aceita
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request }) => cacheableAtRuntime(request),
      handler: new NetworkFirst({ cacheName: SNAPSHOT_CACHE, networkTimeoutSeconds: 3 }),
      method: 'GET',
    },
    // Navegação passa direto para a rede (HTML autenticado nunca é guardado); sem rede cai em /~offline.
    {
      matcher: ({ request }) => request.mode === 'navigate' && !neverCache(request),
      handler: new NetworkOnly(),
      method: 'GET',
    },
  ],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();

// Logout: apaga os caches de runtime (o snapshot tem dados do usuário); o precache fica.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_CACHES') return;
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !n.includes('precache')).map((n) => caches.delete(n))),
      ),
  );
});
