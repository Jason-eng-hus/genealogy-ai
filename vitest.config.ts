import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/tests/**/*.spec.ts', 'shared/tests/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
