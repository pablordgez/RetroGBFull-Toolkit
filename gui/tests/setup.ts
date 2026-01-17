import { vi } from 'vitest';
import '@testing-library/jest-dom';

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