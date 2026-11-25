'use client';

import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

import { LogoutButton } from './logout-button';
import { desktopNav, isActive } from './nav';

/**
 * Sidebar recolhível (≥ 1024px). `footer` recebe o copyright, renderizado no
 * servidor.
 */
export function Sidebar({ footer }: { footer: ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- lê o valor salvo só no cliente
      setCollapsed(localStorage.getItem('sidebar') === 'collapsed');
    } catch {
      // localStorage indisponível (navegação privada ou bloqueado): segue com o padrão
    }
  }, []);

  const toggle = (): void => {
    setCollapsed(!collapsed);

    try {
      localStorage.setItem('sidebar', collapsed ? 'open' : 'collapsed');
    } catch {
      // localStorage indisponível (navegação privada ou bloqueado): segue com o padrão
    }
  };

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface-1 transition-[width] duration-(--duration-slow) lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center px-3">
        <Link href="/" aria-label="Lacus CRM, início">
          <Logo variant={collapsed ? 'mark' : 'lockup'} size={24} />
        </Link>
      </div>
      <div className="px-2">
        <button
          type="button"
          onClick={() => dispatchEvent(new Event('open-palette'))}
          title={collapsed ? 'Buscar (Ctrl+K)' : undefined}
          aria-label={collapsed ? 'Buscar (Ctrl+K)' : undefined}
          className="flex h-11 w-full items-center gap-3 rounded-md border border-border px-3 text-body text-text-muted hover:bg-surface-3 hover:text-text"
        >
          <Search className="size-5 shrink-0" aria-hidden />
          {!collapsed && (
            <>
              Buscar
              <kbd className="ml-auto text-label">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 px-2 py-2">
        {desktopNav.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            aria-current={isActive(href, pathname) ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-md px-3 text-body transition-colors duration-(--duration-fast)',
              isActive(href, pathname)
                ? 'bg-surface-3 font-medium text-text'
                : 'text-text-muted hover:bg-surface-3 hover:text-text',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {!collapsed && label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-border p-2">
        <LogoutButton iconOnly={collapsed} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
          className="flex h-11 items-center gap-3 rounded-md px-3 text-body text-text-muted hover:bg-surface-3 hover:text-text"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden />
          )}
          {!collapsed && 'Recolher'}
        </button>
        {!collapsed && <div className="px-3 pb-1">{footer}</div>}
      </div>
    </aside>
  );
}
