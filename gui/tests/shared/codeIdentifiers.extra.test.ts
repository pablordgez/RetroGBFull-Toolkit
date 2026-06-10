import { describe, expect, it } from 'vitest'
import {
  normalizeCodeIdentifier,
  normalizeCodeIdentifierStem
} from '../../src/shared/codeIdentifiers'

describe('codeIdentifiers additional cases', () => {
  it('normalizes empty, numeric, and punctuation-heavy identifiers', () => {
    expect(normalizeCodeIdentifier('  Hero Actor  ')).toBe('Hero_Actor')
    expect(normalizeCodeIdentifier('---')).toBe('resource')
    expect(normalizeCodeIdentifier('123 start')).toBe('resource_123_start')
    expect(normalizeCodeIdentifier('__Already_OK__')).toBe('Already_OK')
    expect(normalizeCodeIdentifierStem('  Hero Actor  ')).toBe('hero_actor')
  })
})
