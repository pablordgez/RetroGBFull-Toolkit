import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectAssetEditor } from '../../../src/renderer/src/components/hooks/useProjectAssetEditor'
import type { SpriteAssetDocument } from '../../../src/shared/projectAssets'

const createSpriteDocument = (overrides: Partial<SpriteAssetDocument> = {}): SpriteAssetDocument => ({
  kind: 'sprite',
  version: 1,
  width: 8,
  height: 8,
  fps: 6,
  is8x16Mode: false,
  currentFrame: 0,
  frames: [new Array(64).fill(0)],
  palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
  selectedColor: 3,
  ...overrides
})

const createWrapper = (entry: string) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useProjectAssetEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads non-asset-backed documents immediately and saves them locally', async () => {
    const applyDocument = vi.fn()

    const { result } = renderHook(
      () =>
        useProjectAssetEditor({
          expectedKind: 'sprite',
          document: createSpriteDocument(),
          applyDocument
        }),
      {
        wrapper: createWrapper('/sprite-editor')
      }
    )

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    expect(result.current.projectPath).toBe('')
    expect(result.current.assetPath).toBe('')
    expect(applyDocument).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.saveAsset()
    })

    expect(result.current.statusMessage).toBe('Saved.')
    expect(result.current.isDirty).toBe(false)
  })

  it('loads asset-backed documents, supports save shortcuts, and opens the close prompt when dirty', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document: createSpriteDocument({
        width: 16
      })
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, _assetPath, document) => ({
        assetKind: 'sprite',
        resourcePath: 'Sprites/Hero.rgbsprite.json',
        document
      })
    )

    let document = createSpriteDocument()
    const applyDocument = vi.fn((nextDocument: SpriteAssetDocument) => {
      document = nextDocument
    })

    const { result, rerender } = renderHook(
      () =>
        useProjectAssetEditor({
          expectedKind: 'sprite',
          document,
          applyDocument
        }),
      {
        wrapper: createWrapper(
          '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json'
        )
      }
    )

    await waitFor(() => {
      expect(applyDocument).toHaveBeenCalledWith(expect.objectContaining({ width: 16 }))
    })

    document = createSpriteDocument({
      width: 32
    })
    rerender()

    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      closeListener?.()
    })

    expect(result.current.isClosePromptOpen).toBe(true)

    await act(async () => {
      fireSaveShortcut()
    })

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json',
        expect.objectContaining({ width: 32 })
      )
    })
  })

  it('reports load failures', async () => {
    const applyDocument = vi.fn()

    vi.mocked(window.api.loadProjectAssetFile).mockRejectedValueOnce(new Error('Load failed'))

    const { result } = renderHook(
      () =>
        useProjectAssetEditor({
          expectedKind: 'sprite',
          document: createSpriteDocument(),
          applyDocument
        }),
      {
        wrapper: createWrapper(
          '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json'
        )
      }
    )

    await waitFor(() => {
      expect(result.current.statusMessage).toBe('Load failed')
    })
  })

  it('reports expected-kind mismatches', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValueOnce({
      assetKind: 'tileset',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document: {}
    })

    const { result } = renderHook(
      () =>
        useProjectAssetEditor({
          expectedKind: 'sprite',
          document: createSpriteDocument(),
          applyDocument: vi.fn()
        }),
      {
        wrapper: createWrapper(
          '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json'
        )
      }
    )

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })
    expect(errorSpy).toHaveBeenCalledWith(
      '[project-asset-editor] loadProjectAssetFile failed',
      expect.objectContaining({
        message: 'Expected a sprite asset but received a tileset asset.'
      })
    )
  })

  it('handles close decisions for cancel, discard, and failed saves', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document: createSpriteDocument()
    })
    vi.mocked(window.api.saveProjectAssetFile).mockRejectedValueOnce(new Error('Save failed'))

    let document = createSpriteDocument({
      width: 12
    })

    const { result, rerender } = renderHook(
      () =>
        useProjectAssetEditor({
          expectedKind: 'sprite',
          document,
          applyDocument: (nextDocument) => {
            document = nextDocument as SpriteAssetDocument
          }
        }),
      {
        wrapper: createWrapper(
          '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json'
        )
      }
    )

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    document = createSpriteDocument({
      width: 24
    })
    rerender()
    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      await result.current.handleCloseDecision('cancel')
    })
    expect(result.current.isClosePromptOpen).toBe(false)

    await act(async () => {
      await result.current.handleCloseDecision('save')
    })
    expect(result.current.statusMessage).toBe('Save failed')
    expect(window.api.confirmEditorClose).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleCloseDecision('discard')
    })
    expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
  })
})

const fireSaveShortcut = () => {
  const event = new KeyboardEvent('keydown', {
    key: 's',
    ctrlKey: true,
    bubbles: true
  })
  window.dispatchEvent(event)
}
