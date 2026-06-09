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
      // Keep the unit coverage gate focused on modules with isolated, dependency-light tests.
      include: [
        'src/renderer/src/**/*.{ts,tsx}',
        'src/shared/codeIdentifiers.ts',
        'src/shared/codeIntelligence.ts',
        'src/shared/projectAssetDefaults.ts',
        'src/shared/projectAssetDefinitions.ts',
        'src/shared/projectAssetParsing.ts',
        'src/shared/projectAssetReferenceRemap.ts',
        'src/shared/projectAssetSerialization.ts',
        'src/shared/projectAssets.ts',
        'src/shared/projectCodeWorkspace.ts',
        'src/shared/projectPalettes.ts',
        'src/shared/projectSaveData.ts',
        'src/shared/projectScriptProperties.ts',
        'src/shared/projectScripts.ts',
        'src/shared/projectTags.ts',
        'src/shared/runtimePlatform.ts',
        'src/main/projectCCodeEmitters.ts',
        'src/main/projectCodeLanguageService.ts',
        'src/main/projectGbdk.ts',
        'src/main/projectMake.ts',
        'src/main/projectResourceErrors.ts',
        'src/main/projectResourceFilesystem.ts',
        'src/main/projectResourceNames.ts',
        'src/main/projectResourcePaths.ts',
        'src/main/projectResourceRecords.ts',
        'src/main/projectResourceView.ts',
        'src/main/projectSceneCodeEmitter.ts'
      ],
      exclude: [
        'src/renderer/src/App.tsx',
        'src/renderer/src/main.tsx',
        // Wrapper-heavy views are covered better with integration tests than deep mock-heavy unit tests.
        'src/renderer/src/components/Docking/ResourceManagementPane.tsx',
        'src/renderer/src/components/ProjectLauncher/ProjectLauncher.tsx',
        'src/renderer/src/components/ProjectWorkspace/ProjectWorkspace.tsx',
        'src/renderer/src/components/SceneHierarchy/SceneViewport.tsx',
        'src/renderer/src/components/TilemapEditor/TileGridAssetEditor.tsx',
        // Trivial or runtime-bootstrap files are intentionally deferred from unit coverage.
        'src/renderer/src/components/Docking/projectResourceEvents.ts',
        'src/renderer/src/components/ScriptEditor/configureMonaco.ts',
        'src/renderer/src/components/ScriptEditor/scriptEditorRuntime.ts',
        'src/renderer/src/components/hooks/history/Command.ts',
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
