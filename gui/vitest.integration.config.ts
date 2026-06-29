import { mergeConfig, defineConfig } from 'vitest/config';
import { sharedConfig } from './vitest.shared';

export default defineConfig(mergeConfig(sharedConfig, {
  test: {
    // Only include integration tests
    include: ['tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 20000,
    coverage: {
      reportsDirectory: 'coverage/integration',
      // Renderer integration uses the mocked Electron IPC bridge from tests/setup.ts.
      // Main-process integration covers composed flows; external toolchain boundaries are mocked.
      include: [
        'src/main/projectAssetReferences.ts',
        'src/main/projectAssetFiles.ts',
        'src/main/projectBuildCode.ts',
        'src/main/projectCodeFiles.ts',
        'src/main/projectCodeIntelligence.ts',
        'src/main/projectCodeScripts.ts',
        'src/main/projectCodeShared.ts',
        'src/main/projectCompile.ts',
        'src/main/projectEngineBundle.ts',
        'src/main/projectFileExplorer.ts',
        'src/main/projectLauncher.ts',
        'src/main/projectMetadata.ts',
        'src/main/projectResourceDeletedStore.ts',
        'src/main/projectResourceDiscovery.ts',
        'src/main/projectResourceRepository.ts',
        'src/main/projectResources.ts',
        'src/main/projectResourceTypeStrategies.ts',
        'src/renderer/src/components/Docking/ResourceManagementPane.tsx',
        'src/renderer/src/components/ProjectLauncher/ProjectLauncher.tsx',
        'src/renderer/src/components/ProjectWorkspace/SceneEditorWorkspace.tsx',
        'src/renderer/src/components/ProjectWorkspace/ProjectWorkspace.tsx',
        // Private scene-workspace hooks are exercised through the composed workspace flows above.
        'src/renderer/src/components/SceneHierarchy/SceneHierarchyPane.tsx',
        'src/renderer/src/components/SceneHierarchy/SceneInspectorPane.tsx',
        'src/renderer/src/components/ScriptEditor/ScriptEditor.tsx',
        'src/renderer/src/components/SpriteEditor/SpriteEditor.tsx',
        'src/renderer/src/components/TilemapEditor/TileGridAssetEditor.tsx',
        'src/renderer/src/components/TilemapEditor/TilemapEditor.tsx',
        'src/renderer/src/components/TilemapEditor/WindowEditor.tsx',
        'src/renderer/src/components/Tileset/TilesetEditor.tsx'
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
