import type { Metadata } from 'next';

export const RESPONSIBLE = 'Júlio do Lago Müller';
export const CONTACT_EMAIL = 'juliodolago@gmail.com';
export const UPDATED_AT = '21 de novembro de 2026';

/** Metadados das páginas públicas; URLs absolutas derivam de NEXT_PUBLIC_APP_URL. */
export function publicMetadata(path: string, title: string, description: string): Metadata {
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Lacus CRM',
      url: path,
      title,
      description,
    },
  };
}
