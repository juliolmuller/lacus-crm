import { defineConfig, devices } from '@playwright/test';

const port = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  globalSetup: './tests/e2e/warmup.ts',
  timeout: 120_000, // máquina de dev carregada: o 1º page.goto do navegador chega a levar 25 s
  retries: 1, // a 1ª compilação do dev server pode recarregar a página no meio do teste
  expect: { timeout: 30_000 }, // 1ª chamada de cada Server Action compila no dev server
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_AUTH_BYPASS: '1',
      NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
  },
});
