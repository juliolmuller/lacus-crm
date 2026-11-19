import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// SPEC 14: axe nas rotas principais, nos dois temas. Só serious/critical reprovam.
for (const [route, ready] of [
  ['/leads', 'Leads'],
  ['/funil', 'Funil'],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${route} no tema ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.goto(`/api/e2e/login?next=${route}`);
      await expect(page.getByRole('heading', { name: ready, level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .getByRole('table')
        .or(page.getByRole('list', { name: /^Cartões de/ }).first())
        .first()
        .waitFor();
      const { violations } = await new AxeBuilder({ page }).analyze();
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
    });
  }
}
