import { describe, expect, it } from 'vitest'
import {
  shouldDeferInitialRuntimeForScript,
  shouldDeferRuntimeUntilEdit
} from '../../../src/renderer/src/components/ScriptEditor/scriptEditorRuntimePolicy'

describe('scriptEditorRuntimePolicy', () => {
  it('enables the runtime for all supported script kinds', () => {
    expect(shouldDeferInitialRuntimeForScript('general', '')).toBe(true)
    expect(shouldDeferInitialRuntimeForScript('general', 'void test(void) {}\n')).toBe(false)
    expect(shouldDeferInitialRuntimeForScript('actor', '')).toBe(false)
    expect(shouldDeferInitialRuntimeForScript('scene', '')).toBe(false)
  })

  it('only defers general runtime while the script is blank and untouched', () => {
    expect(shouldDeferRuntimeUntilEdit('general', 'void test(void) {}\n', false)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('general', '', true)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('general', 'void test(void) {}\n', true)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('actor', '', false)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('scene', '', false)).toBe(false)
  })
})
