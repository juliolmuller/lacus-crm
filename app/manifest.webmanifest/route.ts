import type { MetadataRoute } from 'next';

// SPEC 8. Ícones gerados por `pnpm icons` (scripts/generate-icons.ts).
const icon = (size: number, purpose: 'any' | 'maskable') => ({
  src: `/brand/${purpose === 'any' ? 'icon' : 'icon-maskable'}-${size}.png`,
  sizes: `${size}x${size}`,
  type: 'image/png',
  purpose,
});

const manifest: MetadataRoute.Manifest = {
  name: 'Lacus CRM',
  short_name: 'Lacus CRM',
  description: 'CRM de prospecção da Lacus Solutions',
  lang: 'pt-BR',
  display: 'standalone',
  start_url: '/?source=pwa',
  scope: '/',
  background_color: '#0B0D10',
  theme_color: '#0B0D10',
  icons: [icon(192, 'any'), icon(512, 'any'), icon(192, 'maskable'), icon(512, 'maskable')],
  shortcuts: [
    { name: 'Novo lead', url: '/leads?novo=1' },
    { name: 'Lembretes de hoje', url: '/lembretes' },
    { name: 'Funil', url: '/funil' },
  ].map((s) => ({ ...s, icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] })),
};

// Rota em vez de app/manifest.ts: a convenção de arquivo injeta o próprio <link rel="manifest"> sem
// crossorigin (só em preview da Vercel), e o SPEC 8 pede use-credentials; o link fica no layout.
export const dynamic = 'force-static';

export const GET = () =>
  Response.json(manifest, { headers: { 'Content-Type': 'application/manifest+json' } });
