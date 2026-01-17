import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', 
    
    globals: true,
    setupFiles: './tests/setup.ts', 

    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // @ts-expect-error - ignore
      all: true,
      exclude: [
        'src/main/index.ts',
        'src/preload/**',
        '**/*.d.ts',
        'tests/**',
        'vitest.config.ts'
      ] 
    },
  },
});