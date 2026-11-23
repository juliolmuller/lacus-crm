import { defineConfig, devices } from '@playwright/test';

import { pointToE2eDatabase } from './tests/e2e/env';

const db = pointToE2eDatabase(); // servidor e testes usam `<banco>_e2e`, nunca o de desenvolvimento

const port = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 2, // o dev server compila sob demanda: mais workers só trazem timeouts
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
    command: `bun tests/e2e/setup-db.ts && bunx next dev --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false, // um servidor já aberto apontaria para o banco de desenvolvimento
    timeout: 240_000, // recria o banco e2e, semeia e sobe o dev server (lento no WSL)
    env: {
      ...db,
      E2E_AUTH_BYPASS: '1',
      NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
  },
});
