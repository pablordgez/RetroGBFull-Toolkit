import { describe, expect, it } from 'vitest'
import { shouldSkipBlankCompletionRequest } from '../../../src/renderer/src/components/ScriptEditor/scriptEditorCompletionPolicy'

describe('scriptEditorCompletionPolicy', () => {
  it('skips global completion requests for blank visible editor buffers', () => {
    expect(shouldSkipBlankCompletionRequest('', false)).toBe(true)
    expect(shouldSkipBlankCompletionRequest('   \n\t', false)).toBe(true)
  })

  it('keeps code intelligence active after typing or trigger characters', () => {
    expect(shouldSkipBlankCompletionRequest('void test', false)).toBe(false)
    expect(shouldSkipBlankCompletionRequest('', true)).toBe(false)
  })
})
