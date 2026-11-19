'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActive, mobileNav } from './nav';

/** Navegação inferior (< 1024px): 5 itens, alvos ≥ 44px, respeita safe-area-inset. */
export function BottomNav() {
  const pathname = usePathname();
  // "Mais" também ativa nas rotas que vivem dentro dele
  const moreRoutes = ['/fila', '/configuracoes', '/design-system'];
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-1 pb-(--safe-bottom) lg:hidden"
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
