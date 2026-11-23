import Link from 'next/link';

import { Copyright } from '@/components/brand/copyright';
import { Logo } from '@/components/brand/logo';
import { BottomNav } from '@/components/layout/bottom-nav';
import { CommandPalette } from '@/components/layout/command-palette';
import { GoogleBanner } from '@/components/layout/google-banner';
import { Sidebar } from '@/components/layout/sidebar';
import { IosInstallHint } from '@/components/pwa/ios-install-hint';
import { SnapshotWarmer } from '@/components/pwa/snapshot-warmer';
import { requireOwner } from '@/lib/auth/dal';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  await requireOwner();

  return (
    <div className="flex min-h-dvh">
      <Sidebar footer={<Copyright />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-border px-4 pt-(--safe-top) lg:hidden">
          <Link href="/" aria-label="Lacus CRM, início">
            <Logo variant="mark" size={24} />
          </Link>
        </header>
        <main className="flex-1 p-4 pb-[calc(5rem+var(--safe-bottom))] lg:p-8 lg:pb-8">
          <GoogleBanner />
          {children}
        </main>
      </div>
      <BottomNav />
      <CommandPalette />
      <SnapshotWarmer />
      <IosInstallHint />
    </div>
  );
}
