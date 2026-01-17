import { describe, it, expect, beforeEach } from 'vitest';
import { incrementBackend, getBackendCount, resetBackend } from '../../src/main/backendCounter';

describe('Backend Counter Logic', () => {
  beforeEach(() => {
    resetBackend();
  });

  it('increments 5 times correctly', () => {
    incrementBackend();
    incrementBackend();
    incrementBackend();
    incrementBackend();
    const result = incrementBackend();

    expect(result).toBe(5);
    expect(getBackendCount()).toBe(5);
  });
});