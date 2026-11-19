'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActive, mobileNav } from './nav';

/** "Mais" também ativa nas rotas que vivem dentro dele. */
const moreRoutes = ['/fila', '/configuracoes', '/design-system'];

/** Barra com os 5 itens, alvos ≥ 44px. Sem posição própria: quem usa decide (fixa no shell, em quadro no /design-system). */
export function BottomNavBar({
  pathname,
  label = 'Principal',
  className,
}: {
  pathname: string;
  label?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn('border-t border-border bg-surface-1 pb-(--safe-bottom)', className)}
    >
      <ul className="grid grid-cols-5">
        {mobileNav.map(({ href, label, Icon }) => {
          const active =
            isActive(href, pathname) ||
            (href === '/mais' && moreRoutes.some((r) => isActive(r, pathname)));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 text-label',
                  active ? 'text-primary' : 'text-text-muted',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Navegação inferior (< 1024px), fixa, respeitando safe-area-inset. */
export function BottomNav() {
  return (
    <BottomNavBar pathname={usePathname()} className="fixed inset-x-0 bottom-0 z-20 lg:hidden" />
  );
}
