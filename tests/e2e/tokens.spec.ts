import { expect, test } from '@playwright/test';
import { query } from './db';

test('criar token → copiar uma única vez → usar → revogar', async ({ page, request }, info) => {
  const name = `e2e-token-${Date.now()}-${info.project.name}`;
  await page.goto('/api/e2e/login?next=/configuracoes');
  await page.getByLabel('Nome do token').fill(name);
  await page.getByRole('button', { name: 'Criar token' }).click();
  const box = page.getByTestId('new-token');
  await expect(box).toBeVisible();
  const token = (await box.locator('code').innerText()).trim();
  expect(token).toMatch(/^lcrm_/);

  // só o hash fica no banco
  const [row] = await query<{ token_hash: string }>(
    'select token_hash from api_tokens where name = $1',
    [name],
  );
  expect(row!.token_hash).not.toContain(token);

  const ok = await request.get('/api/v1/api-usage/today', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ok.status()).toBe(403); // criado só com `read`: escopo prospecting falta
  const leads = await request.get('/api/v1/leads?limit=1', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(leads.status()).toBe(200);

  // depois de recarregar, o texto completo não aparece mais
  await page.reload();
  await expect(page.getByTestId('new-token')).toHaveCount(0);
  await expect(page.getByText(token)).toHaveCount(0);
  const line = page.getByRole('row', { name: new RegExp(name) });
  await expect(line).toContainText(token.slice(0, 8));

  await line.getByRole('button', { name: `Revogar ${name}` }).click();
  await expect(line.getByText('Revogado')).toBeVisible();
  const after = await request.get('/api/v1/leads?limit=1', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(after.status()).toBe(401);
  await query('delete from api_tokens where name = $1', [name]);
});
