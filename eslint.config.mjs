import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  { files: ['*.config.*'], rules: { 'import/no-anonymous-default-export': 'off' } },
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'drizzle/**',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
