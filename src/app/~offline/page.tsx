import { type Metadata } from 'next';

import { Logo } from '@/components/brand/logo';
import { OfflineView } from '@/components/pwa/offline-view';

export const metadata: Metadata = { title: 'Offline' };

// Pública e pré-cacheada pelo service worker; os dados vêm do snapshot guardado no navegador.
export default function Page(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pt-8">
      <Logo variant="mark" size={32} />
      <OfflineView />
    </main>
  );
}
