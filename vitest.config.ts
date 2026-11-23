import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@': resolve(import.meta.dirname, 'src') };

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      {
        resolve: { alias },
        test: {
          name: 'int',
          include: ['tests/int/**/*.test.ts'],
          globalSetup: ['tests/int/global-setup.ts'],
          setupFiles: ['tests/int/setup.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
