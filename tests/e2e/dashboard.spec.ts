import { expect, test } from '@playwright/test';
import { query, removeLeads, seedDeals } from './db';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const created: string[] = [];
test.afterEach(async () => {
  await removeLeads(created.splice(0));
});

test('painel: KPIs, blocos e filtros de período, nicho e região na URL', async ({ page }) => {
  await page.goto('/api/e2e/login?next=/');
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  const kpis = page.getByTestId('kpis');
  for (const label of [
    'Leads novos',
    'Abordados',
    'Taxa de resposta',
    'Taxa de ganho',
    'Valor em aberto',
    'Score médio',
  ])
    await expect(kpis.getByText(label, { exact: true })).toBeVisible();
  for (const name of [
    'Follow-ups',
    'Melhores próximos',
    'Funil',
    'Prospecção',
    'Distribuição dos leads',
    'Atividade recente',
  ])
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();

  const filters = page.getByTestId('dashboard-filters');
  await expect(filters.getByRole('button', { name: '30 dias' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await filters.getByRole('button', { name: '7 dias' }).click();
  await expect(page).toHaveURL(/period=7/);
  await expect(kpis.getByText('nos últimos 7 dias').first()).toBeVisible();
  await filters.getByRole('button', { name: 'Tudo' }).click();
  await expect(page).toHaveURL(/period=all/);
  await expect(kpis.getByText('em todo o período').first()).toBeVisible();

  const niche = filters.getByLabel('Nicho');
  const first = await niche.locator('option:not([value=""])').first().getAttribute('value');
  await niche.selectOption(first!);
  await expect(page).toHaveURL(new RegExp(`niche=${first}`));
  await page.reload(); // o filtro vem da URL
  await expect(filters.getByLabel('Nicho')).toHaveValue(first!);
  await expect(filters.getByRole('button', { name: 'Tudo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await filters.getByLabel('Nicho').selectOption('');
  await expect(page).not.toHaveURL(/niche=/);
});

test('follow-up atrasado aparece no painel e Concluir o tira de lá', async ({ page }) => {
  const tag = stamp();
  const [lead] = await seedDeals([`E2E Painel ${tag}`], null);
  created.push(lead!.id);
  await query(
    "insert into reminders (lead_id, title, due_at) values ($1, $2, now() - interval '3 hours')",
    [lead!.id, `Ligar ${tag}`],
  );
  await page.goto('/api/e2e/login?next=/?period=all');
  const band = page.getByTestId('followups-overdue');
  const item = band.getByTestId('reminder').filter({ hasText: `Ligar ${tag}` });
  await expect(item).toContainText('Atrasado');
  await item.getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(item).toHaveCount(0);
  const [r] = await query<{ status: string }>('select status from reminders where title = $1', [
    `Ligar ${tag}`,
  ]);
  expect(r!.status).toBe('done');
});

test.describe('somente desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'estado global (api_usage_log do dia)');

  test('uso da API acima do orçamento mostra alerta e barra vermelha', async ({ page }) => {
    const [row] = await query<{ id: number }>(
      `insert into api_usage_log (day, at, requests, leads_saved)
       values ((now() at time zone 'America/Sao_Paulo')::date, '03:00', 9999, 0) returning id`,
    );
    try {
      await page.goto('/api/e2e/login?next=/');
      const alert = page.getByTestId('alert-over_budget');
      await expect(alert).toContainText('passou do orçamento');
      await expect(page.getByRole('region', { name: 'Prospecção' })).toContainText(
        'Acima do orçamento',
      );
    } finally {
      await query('delete from api_usage_log where id = $1', [row!.id]);
    }
  });
});
