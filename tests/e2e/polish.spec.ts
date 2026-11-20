import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { removeLeads, seedDeals } from './db';

test('paleta ⌘K: abre com Ctrl+K, acha lead por nome, executa ação e fecha com Esc', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a paleta é do desktop');
  const [lead] = await seedDeals([`Paleta Teste ${Date.now()}`], null);
  try {
    await page.goto('/api/e2e/login?next=/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
    await expect(async () => {
      await page.keyboard.press('Control+k');
      await expect(palette).toBeVisible({ timeout: 1500 });
    }).toPass(); // o atalho só existe depois da hidratação
    await expect(palette.getByRole('option', { name: 'Funil' })).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('[cmdk-root]').analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );

    await palette.getByRole('combobox').fill(lead!.name.slice(0, 14));
    await palette.getByRole('option', { name: new RegExp(lead!.name) }).click();
    await expect(page).toHaveURL(new RegExp(`lead=${lead!.id}`));

    // o drawer do lead é um <dialog> modal: a paleta não abre por cima dele
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: lead!.name })).toBeVisible();
    await expect(palette).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/leads$/);
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('fila');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fila$/);

    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  } finally {
    await removeLeads([lead!.id]);
  }
});

test('configurações: score com prévia, aparência (densidade), dados e sobre', async ({ page }) => {
  await page.goto('/api/e2e/login?next=/configuracoes');
  const preview = page.getByTestId('score-preview');
  await expect(preview).toContainText('leads mudam de faixa');
  await page.getByLabel('Verde a partir de').fill('5');
  await expect(preview).toContainText(/\d+ de \d+ leads mudam de faixa/);
  await page.getByLabel('Verde a partir de').fill('70'); // não salva nada: o banco fica como estava

  await page.getByRole('button', { name: 'Recalcular' }).click();
  await expect(page.getByText(/lead\(s\) recalculado\(s\)/)).toBeVisible();

  await page.getByRole('radio', { name: 'Compacto' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('radio', { name: 'Confortável' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');

  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute(
    'href',
    '/api/leads/export',
  );
  await expect(page.getByRole('link', { name: 'Importar CSV' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'LGPD e opt-out' })).toBeVisible();
  await expect(page.getByText(/Lacus CRM, versão \d+\.\d+\.\d+/)).toBeVisible();
});

test('densidade padrão: confortável no celular, compacto no desktop', async ({
  page,
  isMobile,
}) => {
  await page.goto('/api/e2e/login?next=/configuracoes');
  await expect(page.locator('html')).toHaveAttribute(
    'data-density',
    isMobile ? 'comfortable' : 'compact',
  );
});
