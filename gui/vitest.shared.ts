import { UserConfig } from 'vitest/config';

export const sharedConfig: UserConfig = {
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Default exclude list for both
      exclude: [
        '**/*.d.ts',
        'tests/**',
        'vitest.config.ts',
        'vitest.integration.config.ts',
        'vitest.shared.ts'
      ]
    },
  },
};
