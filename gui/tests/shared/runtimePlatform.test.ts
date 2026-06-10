import { describe, expect, it } from 'vitest'
import { getCurrentRuntimePlatform } from '../../src/shared/runtimePlatform'

describe('runtimePlatform', () => {
  it('maps known Node platforms and falls back for unknown values', () => {
    expect(getCurrentRuntimePlatform('win32')).toBe('win32')
    expect(getCurrentRuntimePlatform('darwin')).toBe('darwin')
    expect(getCurrentRuntimePlatform('linux')).toBe('linux')
    expect(getCurrentRuntimePlatform('freebsd')).toBe('unknown')
  })
})
