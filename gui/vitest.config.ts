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
        // GUI unit coverage should stay focused on renderer logic, not Electron main-process code.
        'src/main/**',
        'src/preload/**',
        'src/renderer/src/App.tsx',
        'src/renderer/src/main.tsx',
        'src/renderer/src/components/TemporaryHub.tsx',
        // Wrapper-heavy views are covered better with integration tests than deep mock-heavy unit tests.
        'src/renderer/src/components/MenuBar/AppMenuBar.tsx',
        'src/renderer/src/components/Docking/ResourceManagementPane.tsx',
        'src/renderer/src/components/ProjectWorkspace/ProjectWorkspace.tsx',
        'src/renderer/src/components/ProjectWorkspace/SceneEditorWorkspace.tsx',
        'src/renderer/src/components/SceneHierarchy/SceneViewport.tsx',
        'src/renderer/src/components/TilemapEditor/TileGridAssetEditor.tsx',
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
