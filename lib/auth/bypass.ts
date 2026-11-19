export const E2E_SUB = 'e2e-owner';
export const E2E_EMAIL = 'e2e@lacus.test';

/**
 * Rota de login para testes E2E: só com E2E_AUTH_BYPASS=1 e fora da Vercel. Em build de produção
 * (E2E do PWA, `next start`) exige também E2E_PROD_BUILD=1.
 */
export const isE2EBypassActive = () =>
  process.env.E2E_AUTH_BYPASS === '1' &&
  (process.env.NODE_ENV !== 'production' || process.env.E2E_PROD_BUILD === '1') &&
  process.env.VERCEL_ENV === undefined;
