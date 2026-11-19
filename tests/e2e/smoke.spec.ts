import { expect, test } from '@playwright/test';

const copyright = /© \d{4} Lacus Solutions\. Todos os direitos reservados\./;

test('login mostra logo, título e rodapé de copyright', async ({ page }) => {
  const response = await page.goto('/login');
  await expect(page).toHaveTitle('Entrar · Lacus CRM');
  await expect(page.getByText('Lacus CRM', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').locator('svg').first()).toBeVisible();
  await expect(page.getByText(copyright)).toBeVisible();
  expect(response?.headers()['content-security-policy']).toContain("'nonce-");
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
});

test('sem sessão, rotas protegidas redirecionam para /login', async ({ page }) => {
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login$/);
});

test('com o bypass, o shell renderiza e o rodapé aparece', async ({ page, isMobile }) => {
  await page.goto('/api/e2e/login');
  await expect(page).toHaveURL('/');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav).toBeVisible();
  for (const label of isMobile
    ? ['Início', 'Leads', 'Funil', 'Lembretes', 'Mais']
    : ['Início', 'Leads', 'Funil', 'Lembretes', 'Fila', 'Configurações', 'Design System']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  if (isMobile) {
    await nav.getByRole('link', { name: 'Mais' }).click();
    await expect(page).toHaveURL(/\/mais$/);
  }
  await expect(page.getByText(copyright).locator('visible=true')).toBeVisible();
});

test('/design-system abre atrás do login e mostra a marca', async ({ page }) => {
  await page.goto('/api/e2e/login?next=/design-system');
  await expect(page.getByRole('heading', { name: 'Marca' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Botões' })).toBeVisible();
});
