import { vi } from 'vitest';
import '@testing-library/jest-dom';
import 'vitest-canvas-mock';

// Mock Electron API
vi.mock('electron', () => {
  return {
    ipcRenderer: {
      on: vi.fn(),
      send: vi.fn(),
      invoke: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});

Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    openSpriteEditorWindow: vi.fn(),
    openProjectAssetEditor: vi.fn().mockResolvedValue(true),
    pickProjectParentDirectory: vi.fn().mockResolvedValue(null),
    createProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    loadRecentProject: vi.fn(),
    closeCurrentProject: vi.fn().mockResolvedValue(true),
    openProjectInFileExplorer: vi.fn().mockResolvedValue(true),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    loadProjectAssetFile: vi.fn(),
    saveProjectAssetFile: vi.fn(),
    getProjectResources: vi.fn().mockResolvedValue({
      projectName: 'MockProject',
      projectPath: '/projects/MockProject',
      currentPath: '',
      parentPath: null,
      items: [],
    }),
    createProjectResource: vi.fn(),
    renameProjectResource: vi.fn(),
    deleteProjectResource: vi.fn(),
    transferProjectResource: vi.fn(),
    scanProjectDirectory: vi.fn().mockResolvedValue({ trackedCount: 0, removedCount: 0 }),
    restoreDeletedProjectResource: vi.fn(),
    finalizeDeletedProjectResource: vi.fn().mockResolvedValue(true),
    onProjectAssetSaved: vi.fn(() => () => undefined),
    createProjectFolder: vi.fn(),
    renameProjectFolder: vi.fn(),
    deleteProjectFolder: vi.fn(),
    onEditorCloseRequested: vi.fn(() => () => undefined),
    confirmEditorClose: vi.fn().mockResolvedValue(true),
  },
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});
