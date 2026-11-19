import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { headers } from 'next/headers';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Lacus CRM', template: '%s · Lacus CRM' },
  description: 'CRM de prospecção da Lacus Solutions',
  applicationName: 'Lacus CRM',
  icons: {
    icon: [
      { url: '/brand/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon.ico', sizes: '32x32' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
};

export const viewport: Viewport = { themeColor: '#0B0D10', viewportFit: 'cover' };

// Aplica o tema salvo antes da hidratação (evita flash). "system" segue prefers-color-scheme.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster />
      </body>
    </html>
  );
}
