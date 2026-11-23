import { ChevronRight } from 'lucide-react';
import { type Metadata } from 'next';
import Link from 'next/link';

import { Copyright } from '@/components/brand/copyright';
import { LogoutButton } from '@/components/layout/logout-button';
import { moreNav } from '@/components/layout/nav';
import { ThemeSelector } from '@/components/layout/theme-selector';
import { InstallApp } from '@/components/pwa/install-app';

export const metadata: Metadata = { title: 'Mais' };

export default function Page(): React.JSX.Element {
  return (
    <section className="flex max-w-xl flex-col gap-6">
      <h1 className="text-page">Mais</h1>
      <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
        {moreNav.map(({ href, label, Icon }) => (
          <li key={href} className="border-b border-border last:border-b-0">
            <Link
              href={href}
              className="flex min-h-12 items-center gap-3 px-4 text-body hover:bg-surface-3"
            >
              <Icon className="size-5 text-text-muted" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <h2 className="text-label text-text-muted">Aparência</h2>
        <ThemeSelector />
      </div>
      <InstallApp />
      <LogoutButton />
      <Copyright />
    </section>
  );
}
