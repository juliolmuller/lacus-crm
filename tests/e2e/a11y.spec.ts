import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

import { query, removeLeads, seedDeals } from './db';

// SPEC 14: axe nas rotas principais, nos dois temas. Só serious/critical reprovam.
async function scan(page: Page, include?: string): Promise<void> {
  const axe = new AxeBuilder({ page });
  const { violations } = await (include ? axe.include(include) : axe).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

async function open(
  page: Page,
  theme: 'dark' | 'light',
  path: string,
  heading: string,
): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto(`/api/e2e/login?next=${path}`);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // a troca de tema anima as cores; o axe não pode medir no meio da transição
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
}

const routes = [
  ['/', 'Início', (p: Page): Locator => p.getByTestId('kpis')],
  ['/leads', 'Leads', (p: Page): Locator => p.getByRole('table')],
  ['/funil', 'Funil', (p: Page): Locator => p.getByRole('list', { name: /^Cartões de/ }).first()],
  [
    '/lembretes',
    'Lembretes',
    (p: Page): Locator => p.getByRole('navigation', { name: 'Filtro de lembretes' }),
  ],
  ['/fila', 'Fila', (p: Page): Locator => p.getByRole('table')],
  [
    '/configuracoes',
    'Configurações',
    (p: Page): Locator => p.getByRole('heading', { name: 'Perfil', level: 2 }),
  ],
  ['/design-system', 'Design System', (p: Page): Locator => p.getByRole('heading', { level: 1 })],
] as const;

for (const [route, heading, ready] of routes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${route} no tema ${theme}`, async ({ page }) => {
      await open(page, theme, route, heading);
      await ready(page)
        .or(page.getByRole('list', { name: /^Cartões de/ }).first())
        .first()
        .waitFor();
      await scan(page);
    });
  }
}

// rotas públicas (sem sessão)
for (const [route, heading] of [
  ['/login', 'Entrar'],
  ['/~offline', 'Você está offline'],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${route} no tema ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1 }).first()).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
      await scan(page);
    });
  }
}

// drawer do lead com badges de status, lembretes e interações (a dívida de contraste da fase 3)
for (const theme of ['light', 'dark'] as const) {
  test(`axe: lead com lembretes e badges no tema ${theme}`, async ({ page }) => {
    const [lead] = await seedDeals(
      [`E2E Axe ${Date.now()}${Math.floor(Math.random() * 1000)}`],
      'negotiating',
    );

    try {
      await query("update leads set contact_status = 'negotiating' where id = $1", [lead!.id]);
      await query(
        "insert into reminders (lead_id, title, due_at) values ($1, 'Atrasado', now() - interval '1 day')",
        [lead!.id],
      );
      await open(page, theme, `/leads/${lead!.id}`, lead!.name);
      await scan(page);
      await page.getByRole('tab', { name: 'Lembretes' }).click();
      await expect(page.getByTestId('reminder')).toBeVisible();
      await scan(page);
      await page.getByRole('tab', { name: /Interações/ }).click();
      await scan(page);
    } finally {
      await removeLeads([lead!.id]);
    }
  });

  test(`axe: editores de regra e de modelo no tema ${theme}`, async ({ page }) => {
    await open(page, theme, '/configuracoes', 'Configurações');
    for (const [id, dialog] of [
      ['followups', 'Editar regra'],
      ['modelos', 'Editar modelo'],
    ] as const) {
      await page
        .locator(`div:has(> #${id})`)
        .getByRole('button', { name: 'Editar' })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
      await scan(page);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

// A página inteira do /design-system (todos os demos), nos dois temas.
for (const theme of ['light', 'dark'] as const) {
  test(`axe: /design-system completo no tema ${theme}`, async ({ page }) => {
    await open(page, theme, '/design-system', 'Design System');
    await scan(page);
  });
}
