import { defineConfig, devices } from '@playwright/test';

// PWA contra o build de produção (o service worker só roda assim). `pnpm e2e:pwa`.
const port = 3101;

export default defineConfig({
  testDir: 'tests',
  workers: 1, // os testes compartilham o mesmo servidor e o mesmo banco
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'pwa', testMatch: 'pwa/**/*.spec.ts', use: devices['Desktop Chrome'] },
    // o painel também roda no build de produção: lá o 1º toque no celular nunca cai antes da hidratação
    { name: 'painel-desktop', testMatch: 'e2e/dashboard.spec.ts', use: devices['Desktop Chrome'] },
    { name: 'painel-mobile', testMatch: 'e2e/dashboard.spec.ts', use: devices['Pixel 7'] },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    env: {
      E2E_AUTH_BYPASS: '1',
      E2E_PROD_BUILD: '1',
      // valores de mentira: só destravam a validação de ambiente de produção
      VERCEL_CLIENT_ID: 'e2e',
      VERCEL_CLIENT_SECRET: 'e2e',
      OWNER_VERCEL_USER_ID: 'e2e-owner',
      NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
  },
});
