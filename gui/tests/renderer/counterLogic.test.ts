import { describe, it, expect, beforeEach } from 'vitest';
import { incrementCounter, getCount, resetCounter } from '../../src/renderer/src/counterLogic';

describe('Counter Logic', () => {
  beforeEach(() => {
    resetCounter();
  });

  it('should equal 5 after being called 5 times', () => {
    incrementCounter();
    incrementCounter();
    incrementCounter();
    incrementCounter();
    incrementCounter();

    expect(getCount()).toBe(5);
  });
});