import { afterEach, describe, expect, it } from 'vitest'
import {
  getCommandShortcutLabelPrefix,
  isEditableElementTarget,
  isMacLikePlatform
} from '../../../src/renderer/src/components/utils/keyboardShortcuts'

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

describe('keyboardShortcuts', () => {
  afterEach(() => {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
    }
  })

  it('detects editable targets', () => {
    expect(isEditableElementTarget(null)).toBe(false)
    expect(isEditableElementTarget(document.createElement('div'))).toBe(false)
    expect(isEditableElementTarget(document.createElement('input'))).toBe(true)
    expect(isEditableElementTarget(document.createElement('textarea'))).toBe(true)

    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', {
      configurable: true,
      value: true
    })
    expect(isEditableElementTarget(editable)).toBe(true)
  })

  it('detects Mac-like platforms and formats shortcut labels', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { platform: 'MacIntel' }
    })

    expect(isMacLikePlatform()).toBe(true)
    expect(getCommandShortcutLabelPrefix()).toBe('\u2318')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { platform: 'Win32' }
    })

    expect(isMacLikePlatform()).toBe(false)
    expect(getCommandShortcutLabelPrefix()).toBe('Ctrl+')
  })

  it('returns false when navigator is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined
    })

    expect(isMacLikePlatform()).toBe(false)
  })
})
