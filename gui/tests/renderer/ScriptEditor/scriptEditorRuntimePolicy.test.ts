import { describe, expect, it } from 'vitest'
import {
  shouldEnableRuntimeForScript,
  shouldDeferInitialRuntimeForScript,
  shouldDeferRuntimeForBlankScript,
  shouldDeferRuntimeUntilEdit
} from '../../../src/renderer/src/components/ScriptEditor/scriptEditorRuntimePolicy'

describe('scriptEditorRuntimePolicy', () => {
  it('enables the runtime for all supported script kinds', () => {
    expect(shouldEnableRuntimeForScript('general')).toBe(true)
    expect(shouldEnableRuntimeForScript('actor')).toBe(true)
    expect(shouldEnableRuntimeForScript('scene')).toBe(true)
    expect(shouldDeferInitialRuntimeForScript('general', '')).toBe(true)
    expect(shouldDeferInitialRuntimeForScript('general', 'void test(void) {}\n')).toBe(false)
    expect(shouldDeferInitialRuntimeForScript('actor', '')).toBe(false)
    expect(shouldDeferInitialRuntimeForScript('scene', '')).toBe(false)
  })

  it('defers runtime startup for blank general scripts', () => {
    expect(shouldDeferRuntimeForBlankScript('general', '')).toBe(true)
    expect(shouldDeferRuntimeForBlankScript('general', ' \n\t')).toBe(true)
  })

  it('keeps runtime startup enabled for non-blank general, actor, and scene scripts', () => {
    expect(shouldDeferRuntimeForBlankScript('general', 'void test(void) {}\n')).toBe(false)
    expect(shouldDeferRuntimeForBlankScript('actor', '')).toBe(false)
    expect(shouldDeferRuntimeForBlankScript('scene', '')).toBe(false)
  })

  it('only defers general runtime while the script is blank and untouched', () => {
    expect(shouldDeferRuntimeUntilEdit('general', 'void test(void) {}\n', false)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('general', '', true)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('general', 'void test(void) {}\n', true)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('actor', '', false)).toBe(false)
    expect(shouldDeferRuntimeUntilEdit('scene', '', false)).toBe(false)
  })
})
