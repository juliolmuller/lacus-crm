import { expect, test, type Page } from '@playwright/test';
import { query, removeLeads, seedDeals } from '../e2e/db';

const SNAPSHOT = '/api/offline/snapshot';

/** Entra, espera o service worker controlar a página e o snapshot cair no cache. */
async function loginAndWarm(page: Page, next = '/') {
  await page.goto(`/api/e2e/login?next=${next}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
  await expect
    .poll(() =>
      page.evaluate(
        async (path) => !!(await (await caches.open('offline-snapshot')).match(path)),
        SNAPSHOT,
      ),
    )
    .toBe(true);
}

test('manifest público e válido, com link use-credentials', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest'); // sem cookie
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const m = await res.json();
  expect(m).toMatchObject({
    name: 'Lacus CRM',
    short_name: 'Lacus CRM',
    display: 'standalone',
    start_url: '/?source=pwa',
    scope: '/',
    background_color: '#0B0D10',
    theme_color: '#0B0D10',
    lang: 'pt-BR',
  });
  expect(
    m.icons.map((i: { sizes: string; purpose: string }) => `${i.purpose} ${i.sizes}`).sort(),
  ).toEqual(['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']);
  expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual([
    'Novo lead',
    'Lembretes de hoje',
    'Funil',
  ]);
  for (const src of [...m.icons, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)].map(
    (i: { src: string }) => i.src,
  ))
    expect((await request.get(src)).status(), src).toBe(200);
  expect((await request.get('/brand/apple-touch-icon.png')).status()).toBe(200);

  await page.goto('/login');
  const links = page.locator('link[rel="manifest"]');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('crossorigin', 'use-credentials');
  expect((await request.get('/serwist/sw.js')).status()).toBe(200);
  expect((await request.get('/~offline')).status()).toBe(200);
});

test('snapshot exige login', async ({ request }) => {
  const res = await request.get(SNAPSHOT, { maxRedirects: 0 });
  expect([307, 401]).toContain(res.status());
});

test('service worker registra e o app abre offline em /~offline com o snapshot', async ({
  page,
  context,
}) => {
  const [lead] = await seedDeals([`E2E Offline ${Date.now()}`], null);
  try {
    await query('update leads set priority = 1, score = 99, next_action = $2 where id = $1', [
      lead!.id,
      'Ligar amanhã',
    ]);
    await query(
      "insert into reminders (lead_id, title, due_at) values ($1, 'Lembrete offline', now() - interval '1 hour')",
      [lead!.id],
    );
    await loginAndWarm(page);
    const http = await page.request.get(SNAPSHOT);
    expect(http.headers()['cache-control']).toBe('no-store');
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { scope: r?.scope, active: !!r?.active };
    });
    expect(reg).toEqual({ scope: `${new URL(page.url()).origin}/`, active: true });

    await context.setOffline(true);
    await page.goto('/leads');
    await expect(page.getByRole('heading', { name: 'Você está offline', level: 1 })).toBeVisible();
    await expect(
      page.getByText(/^Você está offline: dados de \d\d\/\d\d \d\d:\d\d$/),
    ).toBeVisible();
    await expect(page.getByText('Lembrete offline')).toBeVisible();
    await expect(page.getByText(lead!.name, { exact: true })).toBeVisible();
    await expect(page.getByText(/Ligar amanhã/)).toBeVisible();
    await context.setOffline(false);
  } finally {
    await removeLeads([lead!.id]);
  }
});

test('rotas proibidas e HTML autenticado nunca entram no cache; logout limpa o runtime', async ({
  page,
}) => {
  await loginAndWarm(page);
  await page.goto('/leads');
  await expect(page.getByRole('heading', { name: 'Leads', level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    for (const p of [
      '/api/auth/get-session',
      '/api/v1/leads',
      '/api/jobs/followups',
      '/api/mcp',
      '/api/google/connect',
      '/.well-known/oauth-authorization-server',
    ])
      await fetch(p, { redirect: 'manual' }).catch(() => {});
    await fetch('/api/offline/snapshot', { method: 'POST' }).catch(() => {});
  });
  const cached = () =>
    page.evaluate(async () => {
      const out: Record<string, string[]> = {};
      for (const name of await caches.keys())
        out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
      return out;
    });
  const all = await cached();
  const runtime = Object.entries(all).filter(([n]) => !n.includes('precache'));
  expect(runtime).toEqual([['offline-snapshot', [SNAPSHOT]]]);
  const precached = Object.entries(all).flatMap(([n, urls]) =>
    n.includes('precache') ? urls : [],
  );
  expect(precached).toContain('/~offline');
  for (const u of precached) expect(u, u).toMatch(/^\/(_next\/|~offline$|brand\/|serwist)/);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(async () => Object.keys(await cached()).filter((n) => !n.includes('precache')))
    .toEqual([]);
});

test('"Instalar app" aparece em Mais com beforeinstallprompt', async ({ page }) => {
  await page.goto('/api/e2e/login?next=/mais');
  await expect(page.getByRole('heading', { name: 'Mais', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
    };
    e.prompt = async () => {
      (window as unknown as { prompted: boolean }).prompted = true;
    };
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Instalar app' }).click();
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});

test('iOS: instruções aparecem uma vez quando não está standalone', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: false }));
  const page = await ctx.newPage();
  await page.goto('/api/e2e/login?next=/');
  const dialog = page.getByRole('dialog', { name: 'Instale o Lacus CRM' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Adicionar à Tela de Início')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  await expect(dialog).toBeHidden();
  await ctx.close();
});
