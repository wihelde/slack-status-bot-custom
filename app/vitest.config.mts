import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    root: 'src',
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['../vitest.setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json', 'html', 'cobertura'],
      reportsDirectory: '../coverage',
      // Patterns are relative to the test root (src), including unimported files.
      include: ['**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/__tests__/**'],
    },
  },
});
