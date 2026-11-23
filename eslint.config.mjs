import anyConfig from 'eslint-config-any';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...anyConfig.next(),
  // The docs use GFM task lists (`- [ ]`), which CommonMark reads as label refs.
  { files: ['**/*.md'], language: 'markdown/gfm' },
  // The service worker has its own tsconfig (webworker lib), outside the main project.
  {
    files: ['src/app/sw.ts'],
    languageOptions: { parserOptions: { projectService: false, project: './tsconfig.sw.json' } },
  },
  {
    // Drizzle queries and the Better Auth config are typed by inference: spelling out
    // their return types would copy the schema by hand and drift from it.
    files: ['src/lib/services/**', 'src/lib/db/**', 'src/lib/auth/**', 'tests/**'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },
  globalIgnores([
    '.next/**',
    '.vercel/**',
    '.data/**',
    'out/**',
    'build/**',
    'coverage/**',
    'drizzle/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
