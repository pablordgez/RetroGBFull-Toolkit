import { mergeConfig, defineConfig } from 'vitest/config';
import { sharedConfig } from './vitest.shared';

export default defineConfig(mergeConfig(sharedConfig, {
  test: {
    // Only include integration tests
    include: ['tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reportsDirectory: 'coverage/integration',
      // Define files to calculate coverage for (Integration)
      // You can adjust this to 'src/main/**/*.{ts,tsx}' or specific files
      include: ['src/**/*.{ts,tsx}'], 
      // @ts-expect-error - ignore
      all: true,
    },
  },
}));
