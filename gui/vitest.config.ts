import { mergeConfig, defineConfig } from 'vitest/config';
import { sharedConfig } from './vitest.shared';

export default defineConfig(mergeConfig(sharedConfig, {
  test: {
    // Include all tests EXCEPT integration
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    // Coverage-instrumented filesystem tests in the main process regularly exceed 5s on Windows.
    testTimeout: 20000,
    coverage: {
      reportsDirectory: 'coverage/unit',
      // Keep the unit coverage gate focused on GUI files we actively unit test.
      include: ['src/renderer/src/**/*.{ts,tsx}'],
      exclude: [
        'src/renderer/src/App.tsx',
        'src/renderer/src/main.tsx',
        'src/renderer/src/components/TemporaryHub.tsx',
        'src/renderer/src/components/Layout/ResizablePaneLayout.tsx',
        // Wrapper-heavy views are covered better with integration tests than deep mock-heavy unit tests.
        'src/renderer/src/components/MenuBar/AppMenuBar.tsx',
        'src/renderer/src/components/Docking/ResourceManagementPane.tsx',
        'src/renderer/src/components/ProjectLauncher/ProjectLauncher.tsx',
        'src/renderer/src/components/ProjectWorkspace/ProjectWorkspace.tsx',
        'src/renderer/src/components/SceneHierarchy/SceneViewport.tsx',
        'src/renderer/src/components/TilemapEditor/TileGridAssetEditor.tsx',
        // Trivial or runtime-bootstrap files are intentionally deferred from unit coverage.
        'src/renderer/src/components/Docking/RetroFolderIcon.tsx',
        'src/renderer/src/components/Docking/projectResourceEvents.ts',
        'src/renderer/src/components/PixelEditor/usePixelGridRender.ts',
        'src/renderer/src/components/ProjectAssets/EditorClosePrompt.tsx',
        'src/renderer/src/components/ScriptEditor/configureMonaco.ts',
        'src/renderer/src/components/ScriptEditor/scriptEditorRuntime.ts',
        'src/renderer/src/components/hooks/history/Command.ts',
        'src/renderer/src/components/hooks/viewport/useViewport.ts',
        // Will be tested later with integration tests
        'src/renderer/src/components/SpriteEditor/SpriteEditor.tsx',
        'src/renderer/src/components/Tileset/TilesetEditor.tsx',
        'src/renderer/src/components/TilemapEditor/TilemapEditor.tsx',
      ],
      // @ts-expect-error - ignore
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80
      }
    },
  },
}));
