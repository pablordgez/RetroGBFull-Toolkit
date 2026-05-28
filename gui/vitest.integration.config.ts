import { mergeConfig, defineConfig } from 'vitest/config';
import { sharedConfig } from './vitest.shared';

export default defineConfig(mergeConfig(sharedConfig, {
  test: {
    // Only include integration tests
    include: ['tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 20000,
    coverage: {
      reportsDirectory: 'coverage/integration',
      include: [
        'src/main/projectAssetFiles.ts',
        'src/main/projectCode.ts',
        'src/main/projectFileExplorer.ts',
        'src/main/projectLauncher.ts',
        'src/main/projectMetadata.ts',
        'src/main/projectResources.ts',
        'src/renderer/src/components/ProjectLauncher/ProjectLauncher.tsx',
        'src/renderer/src/components/ProjectWorkspace/ProjectWorkspace.tsx'
      ],
      // @ts-expect-error - ignore
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70
      }
    },
  },
}));
