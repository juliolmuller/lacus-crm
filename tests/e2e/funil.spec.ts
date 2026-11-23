import { expect, type Locator, type Page, test } from '@playwright/test';

import { query, removeLeads, seedDeals } from './db';

const stamp = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const created: string[] = [];

test.afterEach(async () => {
  await removeLeads(created.splice(0));
});

async function seed(
  names: string[],
  stage: null | string,
): Promise<Array<{ dealId?: string; id: string; name: string }>> {
  const rows = await seedDeals(names, stage);

  created.push(...rows.map((r) => r.id));

  return rows;
}

const column = (page: Page, stage: string): Locator =>
  page.getByRole('list', { name: `Cartões de ${stage}` });
const card = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${name}`) });
const names = (list: Locator): Promise<string[]> =>
  list.getByRole('button').evaluateAll((els) => els.map((e) => e.querySelector('p')!.textContent!));

async function openFunnel(page: Page): Promise<void> {
  await page.goto('/api/e2e/login?next=/funil');
  await expect(page.getByRole('heading', { name: 'Funil', level: 1 })).toBeVisible();
}

/**
 * Arrasta com o mouse do centro de `from` ao centro de `to`.
 */
async function mouseDrag(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();

  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;

  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
}

test('criar deal pelo lead → mover → ganhar', async ({ page }) => {
  const [lead] = await seed([`E2E Funil ${stamp()}`], null);

  await page.goto(`/api/e2e/login?next=/leads/${lead!.id}`);
  await page.getByRole('tab', { name: 'Negociação' }).click();
  await page.getByRole('button', { name: 'Criar negociação' }).first().click();
  await expect(page).toHaveURL(/\/funil\?deal=/);

  const drawer = page.getByRole('dialog', { name: lead!.name });

  await expect(drawer.getByText('A diagnosticar · Aberta')).toBeVisible();
  await drawer.getByRole('button', { name: 'Fechar' }).click();
  await expect(page).not.toHaveURL(/deal=/);

  // o lead saiu de "Novo/A abordar" para o status da etapa (D3) e a negociação abriu em A diagnosticar
  await expect(
    column(page, 'A diagnosticar').getByRole('button', { name: new RegExp(lead!.name) }),
  ).toBeVisible();

  const select = page.getByLabel(`Mover ${lead!.name} para…`);

  await select.selectOption({ label: 'Em negociação' });
  await expect(page.getByText(/movida para Em negociação/)).toBeVisible();
  await expect(
    column(page, 'Em negociação').getByRole('button', { name: new RegExp(lead!.name) }),
  ).toBeVisible();
  expect(
    (
      await query<{ contact_status: string }>('select contact_status from leads where id = $1', [
        lead!.id,
      ])
    )[0]!.contact_status,
  ).toBe('negotiating');

  // Ganho exige o diálogo (valor e data)
  await page.getByLabel(`Mover ${lead!.name} para…`).selectOption({ label: 'Ganho' });

  const dialog = page.getByRole('dialog', { name: 'Negociação ganha' });

  await dialog.getByLabel('Valor final (R$)').fill('1.500,00');
  await dialog.getByRole('button', { name: 'Confirmar ganho' }).click();
  await expect(page.getByText(/virou cliente/)).toBeVisible();
  await expect(
    column(page, 'Ganho').getByRole('button', { name: new RegExp(lead!.name) }),
  ).toBeVisible();

  const [row] = await query<{ contact_status: string; status: string; value: string }>(
    `select d.status, d.value, l.contact_status from deals d join leads l on l.id = d.lead_id where l.id = $1`,
    [lead!.id],
  );

  expect(row).toEqual({ status: 'won', value: '1500.00', contact_status: 'client' });
});

test('mouse: arrastar para outra etapa persiste depois do reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'o arraste com mouse é do desktop; o celular tem o teste de toque');

  const [a] = await seed([`E2E Mouse ${stamp()}`], 'to_contact');

  await openFunnel(page);
  await mouseDrag(page, card(page, a!.name), column(page, 'Abordado'));
  await expect(page.getByText(/movida para Abordado/)).toBeVisible();
  await page.reload();
  await expect(
    column(page, 'Abordado').getByRole('button', { name: new RegExp(a!.name) }),
  ).toBeVisible();
  await expect(
    column(page, 'A abordar').getByRole('button', { name: new RegExp(a!.name) }),
  ).toHaveCount(0);

  const hist = await query('select 1 from deal_stage_history where deal_id = $1', [a!.dealId]);

  expect(hist.length).toBe(1); // o seed não grava histórico; só o movimento
});

test('teclado: Espaço pega, setas movem, Espaço solta (com anúncio em pt-BR)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'atalho de teclado do desktop');

  const [a] = await seed([`E2E Teclado ${stamp()}`], 'talking');

  await openFunnel(page);

  const el = card(page, a!.name);

  await el.scrollIntoViewIfNeeded();
  await el.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('status').filter({ hasText: new RegExp(`artão ${a!.name}`) }),
  ).toBeAttached();
  await page.waitForTimeout(300); // o dnd-kit mede as colunas depois de pegar
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await expect(page.getByText(/movida para/)).toBeVisible();
  await page.reload();

  const [d] = await query<{ key: string }>(
    'select s.key from deals d join deal_stages s on s.id = d.stage_id where d.id = $1',
    [a!.dealId],
  );

  expect(d!.key).not.toBe('talking');
  await expect(page.getByRole('button', { name: new RegExp(`^${a!.name}`) })).toBeVisible();
});

test('toque (Pixel 7): long-press de 250 ms reordena e a ordem sobrevive ao reload', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'emulação de toque só no projeto mobile');

  const tag = stamp();
  const rows = await seed(
    [`E2E Toque A ${tag}`, `E2E Toque B ${tag}`, `E2E Toque C ${tag}`],
    'negotiating',
  );

  await openFunnel(page);
  await page
    .getByRole('navigation', { name: 'Etapas' })
    .getByRole('button', { name: /Em negociação/ })
    .click();

  const list = column(page, 'Em negociação');

  await card(page, rows[2]!.name).scrollIntoViewIfNeeded();

  const c = (await card(page, rows[2]!.name).boundingBox())!;
  const a = (await card(page, rows[0]!.name).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = c.x + c.width / 2;

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: c.y + c.height / 2 }],
  });
  await page.waitForTimeout(350); // long-press
  for (let i = 1; i <= 12; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: c.y + c.height / 2 + ((a.y - c.y - 4) * i) / 12 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () =>
      (await names(list)).filter((n) => n?.includes(tag)).map((n) => n!.match(/Toque (\w)/)![1]),
    )
    .toEqual(['C', 'A', 'B']);
  await page.waitForTimeout(500); // a ação grava depois do soltar
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Etapas' })
    .getByRole('button', { name: /Em negociação/ })
    .click();

  const after = (await names(column(page, 'Em negociação'))).filter((n) => n?.includes(tag));

  expect(after.map((n) => n!.match(/Toque (\w)/)![1])).toEqual(['C', 'A', 'B']);
});

test('erro simulado no servidor desfaz o movimento e avisa', async ({ page }) => {
  const [a] = await seed([`E2E Erro ${stamp()}`], 'to_diagnose');

  await openFunnel(page);
  await page.route('**/funil', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  );
  await page.getByLabel(`Mover ${a!.name} para…`).selectOption({ label: 'Abordado' });
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await expect(
    column(page, 'A diagnosticar').getByRole('button', { name: new RegExp(a!.name) }),
  ).toBeVisible();
  await expect(
    column(page, 'Abordado').getByRole('button', { name: new RegExp(a!.name) }),
  ).toHaveCount(0);
  await page.unroute('**/funil');
  await page.reload();
  await expect(
    column(page, 'A diagnosticar').getByRole('button', { name: new RegExp(a!.name) }),
  ).toBeVisible();
});

test('Perdido com "Não contatar" marca o lead e Desfazer reverte um movimento', async ({
  page,
}) => {
  const [a, b] = await seed([`E2E Perda ${stamp()}`, `E2E Volta ${stamp()}`], 'to_diagnose');

  await openFunnel(page);
  await page.getByLabel(`Mover ${a!.name} para…`).selectOption({ label: 'Perdido' });

  const dialog = page.getByRole('dialog', { name: 'Negociação perdida' });

  await dialog.getByLabel('Motivo').selectOption('Não contatar');
  await dialog.getByLabel('Detalhes (opcional)').fill('pediu para parar');
  await dialog.getByRole('button', { name: 'Confirmar perda' }).click();
  await expect(page.getByText('Negociação marcada como perdida')).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await query<{ do_not_contact: boolean }>(
            'select do_not_contact from leads where id = $1',
            [a!.id],
          )
        )[0]!.do_not_contact,
    )
    .toBe(true);

  await page.getByLabel(`Mover ${b!.name} para…`).selectOption({ label: 'A abordar' });
  await expect(
    column(page, 'A abordar').getByRole('button', { name: new RegExp(b!.name) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(
    column(page, 'A diagnosticar').getByRole('button', { name: new RegExp(b!.name) }),
  ).toBeVisible();
  await expect(
    column(page, 'A abordar').getByRole('button', { name: new RegExp(b!.name) }),
  ).toHaveCount(0);
});
