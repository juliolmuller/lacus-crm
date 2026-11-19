'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';

/** Drawer lateral (desktop): abre sobre a lista, fechar remove `?lead=` da URL. */
export function LeadDrawer({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const close = () => {
    const q = new URLSearchParams(search);
    q.delete('lead');
    router.replace(q.size ? `${path}?${q}` : path);
  };
  return (
    <Dialog open onClose={close} title={title} variant="side">
      {children}
    </Dialog>
  );
}
