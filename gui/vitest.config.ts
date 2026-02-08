import { mergeConfig, defineConfig } from 'vitest/config';
import { sharedConfig } from './vitest.shared';

export default defineConfig(mergeConfig(sharedConfig, {
  test: {
    // Include all tests EXCEPT integration
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    coverage: {
      reportsDirectory: 'coverage/unit',
      // Define files to calculate coverage for (Unit)
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/preload/**',
        'src/renderer/src/App.tsx',
        'src/renderer/src/main.tsx',
        'src/renderer/src/components/TemporaryHub.tsx',
        // Will be tested later with integration tests
        'src/renderer/src/components/SpriteEditor/SpriteEditor.tsx',
        'src/renderer/src/components/Tileset/TilesetEditor.tsx',
        'src/renderer/src/components/TilemapEditor/TilemapEditor.tsx',
      ],
      // @ts-expect-error - ignore
      all: true,
    },
  },
}));