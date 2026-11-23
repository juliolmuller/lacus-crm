'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode } from 'react';

import { Dialog } from '@/components/ui/dialog';

/**
 * Drawer lateral: abre sobre a página enquanto `?<param>=` estiver na URL;
 * fechar remove o parâmetro.
 */
export function UrlDrawer({
  param,
  title,
  children,
}: {
  children: ReactNode;
  param: string;
  title: string;
}): React.JSX.Element {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const close = (): void => {
    const q = new URLSearchParams(search);

    q.delete(param);
    router.replace(q.size ? `${path}?${q}` : path);
  };

  return (
    <Dialog open onClose={close} title={title} variant="side">
      {children}
    </Dialog>
  );
}
