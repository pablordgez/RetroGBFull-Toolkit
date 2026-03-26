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
    pickProjectParentDirectory: vi.fn().mockResolvedValue(null),
    createProject: vi.fn(),
    openProjectFromDialog: vi.fn(),
    loadRecentProject: vi.fn(),
    getRecentProjects: vi.fn().mockResolvedValue([]),
  },
});
