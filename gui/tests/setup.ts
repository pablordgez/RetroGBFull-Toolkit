import { vi } from 'vitest'
import '@testing-library/jest-dom'
import 'vitest-canvas-mock'
import type { ProjectBuildProgressPayload } from '../src/shared/projectCodeWorkspace'

// Mock Electron API
vi.mock('electron', () => {
  return {
    ipcRenderer: {
      on: vi.fn(),
      send: vi.fn(),
      invoke: vi.fn(),
      removeListener: vi.fn()
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn()
    }
  }
})

Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    openProjectSaveDataEditor: vi.fn().mockResolvedValue(true),
    openProjectTagEditor: vi.fn().mockResolvedValue(true),
    openProjectAssetEditor: vi.fn().mockResolvedValue(true),
    openProjectScriptEditor: vi.fn().mockResolvedValue(true),
    pickProjectParentDirectory: vi.fn().mockResolvedValue(null),
    createProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    loadRecentProject: vi.fn(),
    closeCurrentProject: vi.fn().mockResolvedValue(true),
    openProjectInFileExplorer: vi.fn().mockResolvedValue(true),
    showProjectResourceInFileExplorer: vi.fn().mockResolvedValue(true),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    getAppPreferences: vi.fn().mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: true
    }),
    saveAppPreferences: vi.fn().mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: true
    }),
    openDocumentation: vi.fn().mockResolvedValue(true),
    getRuntimePlatform: vi.fn().mockResolvedValue('win32'),
    getGbdkToolchainStatus: vi.fn().mockResolvedValue({
      installed: true,
      installPath: '/toolchains/gbdk',
      executablePath: '/toolchains/gbdk/bin/lcc',
      version: null,
      source: 'development-root',
      message: 'GBDK is available at /toolchains/gbdk.'
    }),
    installLatestGbdkToolchain: vi.fn().mockResolvedValue({
      installed: true,
      installPath: '/toolchains/gbdk',
      executablePath: '/toolchains/gbdk/bin/lcc',
      version: 'gbdk-4.5.0',
      source: 'development-root',
      message: 'Installed gbdk-4.5.0 to /toolchains/gbdk.',
      releaseTag: 'gbdk-4.5.0',
      assetName: 'gbdk-win64.zip',
      replacedExisting: false
    }),
    getMakeToolchainStatus: vi.fn().mockResolvedValue({
      installed: true,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: '4.4.1',
      source: 'runtime-managed',
      message: 'GNU Make is available at /toolchains/make/bin/make.'
    }),
    installLatestMakeToolchain: vi.fn().mockResolvedValue({
      installed: true,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: '4.4.1',
      source: 'runtime-managed',
      message: 'Installed GNU Make 4.4.1 to /toolchains/make.',
      releaseVersion: '4.4.1',
      archiveName: 'make-4.4.1.tar.gz',
      replacedExisting: false
    }),
    loadProjectSaveData: vi.fn().mockResolvedValue({ entries: [] }),
    saveProjectSaveData: vi.fn().mockResolvedValue({ entries: [] }),
    loadProjectTags: vi.fn().mockResolvedValue({ entries: [] }),
    saveProjectTags: vi.fn().mockResolvedValue({ entries: [] }),
    loadProjectAssetFile: vi.fn(),
    saveProjectAssetFile: vi.fn(),
    createProjectScriptResource: vi.fn(),
    loadProjectScriptResource: vi.fn(),
    saveProjectScriptResource: vi.fn(),
    listProjectScriptResources: vi.fn().mockResolvedValue([]),
    listProjectScriptCallbackCandidates: vi.fn().mockResolvedValue([]),
    getProjectResources: vi.fn().mockResolvedValue({
      projectName: 'MockProject',
      projectPath: '/projects/MockProject',
      currentPath: '',
      parentPath: null,
      items: []
    }),
    createProjectResource: vi.fn(),
    renameProjectResource: vi.fn(),
    deleteProjectResource: vi.fn(),
    transferProjectResource: vi.fn(),
    updateProjectResourceBank: vi.fn(),
    updateProjectStartingScene: vi.fn(),
    scanProjectDirectory: vi.fn().mockResolvedValue({ trackedCount: 0, removedCount: 0 }),
    copyProjectEngineCore: vi.fn().mockResolvedValue({ copiedPaths: [], skippedPaths: [] }),
    readMaxCollisionCallbacks: vi.fn().mockResolvedValue(4),
    readMaxTagSlots: vi.fn().mockResolvedValue(5),
    buildProjectCode: vi.fn().mockResolvedValue({
      writtenFiles: [],
      saveDataEntryCount: 0,
      spriteCount: 0,
      tilesetCount: 0,
      tilemapCount: 0,
      windowCount: 0,
      musicCount: 0,
      sceneCount: 0,
      actorScriptCount: 0,
      sceneScriptCount: 0
    }),
    buildAndCompileProject: vi.fn().mockResolvedValue({
      buildResult: {
        writtenFiles: [],
        saveDataEntryCount: 0,
        spriteCount: 0,
        tilesetCount: 0,
        tilemapCount: 0,
        windowCount: 0,
        musicCount: 0,
        sceneCount: 0,
        actorScriptCount: 0,
        sceneScriptCount: 0
      },
      compileResult: {
        romPath: 'obj/Example.gb',
        outputSummary: 'Build complete.'
      }
    }),
    getProjectCodeSymbolIndex: vi.fn().mockResolvedValue({
      structs: [],
      enums: [],
      functions: [],
      variables: [],
      macros: [],
      typeAliases: [],
      sourceFilesScanned: 0
    }),
    getProjectCodeWorkspaceSnapshot: vi.fn().mockResolvedValue({
      workspaceRoot: '/workspace',
      files: [],
      sourceFileCount: 0
    }),
    restoreDeletedProjectResource: vi.fn(),
    finalizeDeletedProjectResource: vi.fn().mockResolvedValue(true),
    onProjectAssetSaved: vi.fn(() => () => undefined),
    onProjectScriptSaved: vi.fn(() => () => undefined),
    onProjectTagsSaved: vi.fn(() => () => undefined),
    onProjectBuildProgress: vi.fn((listener: (payload: ProjectBuildProgressPayload) => void) => {
      void listener
      return () => undefined
    }),
    createProjectFolder: vi.fn(),
    renameProjectFolder: vi.fn(),
    deleteProjectFolder: vi.fn(),
    onEditorCloseRequested: vi.fn(() => () => undefined),
    confirmEditorClose: vi.fn().mockResolvedValue(true)
  }
})

class ResizeObserverMock {
  observe(): void {
    return undefined
  }

  unobserve(): void {
    return undefined
  }

  disconnect(): void {
    return undefined
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock
})

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock
})
