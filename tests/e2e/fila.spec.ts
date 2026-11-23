import { expect, type Locator, type Page, test } from '@playwright/test';

import { query } from './db';

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let base = 0;
let regionId = 0;
const niche = `E2E Fila ${stamp}`;
const pos = (n: number): number => base + n;
const row = (page: Page, n: number): Locator => page.getByTestId(`queue-row-${pos(n)}`);

// eslint-disable-next-line no-empty-pattern -- Playwright reads fixtures from the destructured first argument
test.beforeEach(async ({}, info) => {
  base = 800_000_000 + Math.floor(Math.random() * 90_000_000) * 10;

  const label = `PR - E2E ${stamp}-${info.project.name}`;
  const [r] = await query<{ id: number }>(
    `insert into regions (state, city, label) values ('PR', $1, $2) returning id`,
    [`E2E ${stamp}-${info.project.name}`, label],
  );
  regionId = r!.id;
  // sort_order muito baixo: os 3 itens de teste aparecem no topo da lista
  for (const i of [1, 2, 3]) {
    const [nn] = await query<{ id: number }>(`insert into niches (name) values ($1) returning id`, [
      `${niche}-${info.project.name}-${i}`,
    ]);

    await query(
      `insert into prospecting_queue (position, region_id, niche_id, sort_order) values ($1, $2, $3, $4)`,
      [pos(i), regionId, nn!.id, -1_000_000_000 + (base - 800_000_000) + i],
    );
  }
});

let onTestEnd: (() => Promise<unknown>) | null = null;

// eslint-disable-next-line no-empty-pattern -- Playwright reads fixtures from the destructured first argument
test.afterEach(async ({}, info) => {
  await onTestEnd?.();
  onTestEnd = null;
  await query('delete from prospecting_queue where region_id = $1', [regionId]);
  await query('delete from regions where id = $1', [regionId]);
  await query('delete from niches where name like $1', [`${niche}%${info.project.name}%`]);
});

const order = (page: Page): Promise<number[]> =>
  page
    .locator('[data-testid^="queue-row-"]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-testid')!.split('-').pop())));
const mine = async (page: Page): Promise<number[]> =>
  (await order(page)).filter((p) => p > base && p <= base + 3);

test('reordenar por teclado persiste; mover para o topo; pular e reativar; marcar pendente', async ({
  page,
}, info) => {
  // reordenar regrava o sort_order da fila inteira: dois projetos em paralelo se atropelariam
  test.skip(info.project.name !== 'desktop', 'só no desktop');

  // ...e deixa a ordem real da fila como estava
  const saved = await query<{ position: number; sort_order: number }>(
    'select position, sort_order from prospecting_queue where position < 700000000',
  );

  onTestEnd = (): Promise<Array<Record<string, unknown>>> =>
    query(
      `update prospecting_queue p set sort_order = v.s from unnest($1::int[], $2::int[]) v(pos, s) where p.position = v.pos`,
      [saved.map((r) => r.position), saved.map((r) => r.sort_order)],
    );
  await page.goto('/api/e2e/login?next=/fila');
  await expect(page.getByRole('heading', { name: 'Fila', level: 1 })).toBeVisible();
  await expect(row(page, 1)).toBeVisible();
  expect(await mine(page)).toEqual([pos(1), pos(2), pos(3)]);

  // Espaço levanta, seta move, Espaço solta
  const handle = row(page, 1).getByRole('button', { name: /^Reordenar/ });

  await handle.focus();

  // o dnd-kit anuncia cada passo numa região aria-live: espera o anúncio antes da próxima tecla
  const live = page.locator('[aria-live]');

  await page.keyboard.press('Space');
  await expect(live.first()).toContainText(`item ${pos(1)} was moved over`);
  await page.keyboard.press('ArrowDown');
  await expect(live.first()).toContainText(`over droppable area ${pos(2)}`);
  await page.keyboard.press('Space');
  await expect(page.getByText('Ordem salva')).toBeVisible(); // a ação terminou
  await expect.poll(() => mine(page)).toEqual([pos(2), pos(1), pos(3)]);
  await page.reload();
  await expect(row(page, 1)).toBeVisible();
  expect(await mine(page)).toEqual([pos(2), pos(1), pos(3)]);

  // depois do reload o HTML do servidor já aparece, mas o clique só vale depois da hidratação: repete até pegar
  await expect(async () => {
    await row(page, 3).getByRole('button', { name: 'Mover para o topo' }).click();
    await expect(page.getByText('Movido para o topo')).toBeVisible({ timeout: 3000 });
  }).toPass();
  await expect.poll(() => mine(page)).toEqual([pos(3), pos(2), pos(1)]);

  await row(page, 2).getByRole('button', { name: 'Pular' }).click();
  await expect(row(page, 2).getByText('Pulado')).toBeVisible();
  await row(page, 2).getByRole('button', { name: 'Reativar' }).click();
  await expect(row(page, 2).getByText('Pendente')).toBeVisible();

  await query(
    `update prospecting_queue set status = 'error', notes = 'falhou', executed_at = now() where position = $1`,
    [pos(1)],
  );
  await page.reload();
  await expect(row(page, 1).getByText('Com erro')).toBeVisible();
  await expect(async () => {
    await row(page, 1).getByRole('button', { name: 'Marcar como pendente' }).click();
    await expect(row(page, 1).getByText('Pendente')).toBeVisible({ timeout: 3000 });
  }).toPass();
});

test('filtros por status e nicho; painel de uso da API', async ({ page }) => {
  await page.goto('/api/e2e/login?next=/fila');
  await expect(row(page, 1)).toBeVisible();
  await query(`update prospecting_queue set skipped_at = now() where position = $1`, [pos(2)]);
  await page.reload();
  await page.getByLabel('Status').selectOption('skipped');
  await expect(row(page, 2)).toBeVisible();
  await expect(row(page, 1)).toHaveCount(0);
  await page.getByLabel('Status').selectOption('');
  await expect(row(page, 1)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Uso da API' })).toContainText(
    'requisições hoje',
  );
});
