import Link from 'next/link';

import { Copyright } from '@/components/brand/copyright';
import { Logo } from '@/components/brand/logo';

import { CONTACT_EMAIL } from './site';

const LINKS = [
  { href: '/sobre', label: 'Sobre' },
  { href: '/privacidade', label: 'Política de Privacidade' },
  { href: '/termos', label: 'Termos de Uso' },
];

/**
 * Páginas públicas (sem login): página inicial, privacidade e termos.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col pt-(--safe-top)">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/sobre" aria-label="Lacus CRM, página inicial">
            <Logo variant="lockup" size={28} />
          </Link>
          <Link href="/login" className="text-body text-text-muted hover:text-text">
            Entrar
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-body [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-2 [&_h1]:text-page [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-section [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </main>
      <footer className="border-t border-border pb-(--safe-bottom)">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
          <nav aria-label="Páginas públicas" className="flex flex-wrap gap-x-5 gap-y-2 text-body">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-text-muted hover:text-text">
                {l.label}
              </Link>
            ))}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-text-muted hover:text-text">
              Contato: {CONTACT_EMAIL}
            </a>
          </nav>
          <Copyright />
        </div>
      </footer>
    </div>
  );
}
