import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'
import { useSceneAssetReferences } from '../../../src/renderer/src/components/SceneHierarchy/useSceneAssetReferences'

const createEditor = (
  overrides: Partial<SceneDocumentEditor> = {}
): SceneDocumentEditor =>
  ({
    canEdit: true,
    canUndo: false,
    canRedo: false,
    nodes: [],
    tilemapPath: null,
    windowPath: null,
    selectedNodeId: null,
    selectedNode: null,
    selectedActor: null,
    selectedCollision: null,
    editingNode: null,
    clipboard: null,
    spritePalettes: [null, null],
    backgroundPalette: null,
    undo: vi.fn(),
    redo: vi.fn(),
    selectNode: vi.fn(),
    beginEditingNode: vi.fn(),
    setEditingNodeDraftName: vi.fn(),
    cancelEditingNode: vi.fn(),
    commitRename: vi.fn(),
    canCreateNode: vi.fn(() => false),
    createNode: vi.fn(),
    deleteNode: vi.fn(),
    toggleCollapsed: vi.fn(),
    stageClipboard: vi.fn(),
    canPasteTo: vi.fn(() => false),
    pasteNodes: vi.fn(),
    updateActor: vi.fn(),
    setActorResourcePath: vi.fn(),
    setFollowedActor: vi.fn(),
    setNodeTags: vi.fn(),
    updateCollision: vi.fn(),
    clampActorsToMap: vi.fn(),
    setTilemapPath: vi.fn(),
    setWindowPath: vi.fn(),
    loadActor: vi.fn(),
    snapshotActor: vi.fn(),
    setSpritePalette: vi.fn(),
    setBackgroundPalette: vi.fn(),
    setActorSpritePaletteIndex: vi.fn(),
    ...overrides
  }) as SceneDocumentEditor

describe('useSceneAssetReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads tilemap, window, sprite previews, and reloads when a watched asset is saved', async () => {
    let savedListener:
      | ((payload: { projectPath: string; assetPath: string; assetKind: 'tilemap' | 'window' | 'tileset' | 'sprite' }) => void)
      | undefined

    vi.mocked(window.api.onProjectAssetSaved).mockImplementation((listener) => {
      savedListener = listener as typeof savedListener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'Maps/Room.rgbtilemap.json') {
        return {
          assetKind: 'tilemap' as const,
          resourcePath: assetPath,
          document: {
            kind: 'tilemap' as const,
            version: 1,
            width: 20,
            height: 18,
            grid: new Array(20 * 18).fill(0),
            tilesetPath: 'Tilesets/Main.rgbtileset.json',
            selectedTileIndex: 0,
            tool: 'brush' as const
          }
        }
      }

      if (assetPath === 'Windows/HUD.rgbwindow.json') {
        return {
          assetKind: 'window' as const,
          resourcePath: assetPath,
          document: {
            kind: 'window' as const,
            version: 1,
            width: 20,
            height: 18,
            grid: new Array(20 * 18).fill(0),
            tilesetPath: 'Tilesets/UI.rgbtileset.json',
            selectedTileIndex: 0,
            tool: 'brush' as const,
            windowVisibilityBands: [
              { start: 0, end: 16 },
              { start: 120, end: 144 }
            ]
          }
        }
      }

      if (assetPath === 'Sprites/Hero.rgbsprite.json') {
        return {
          assetKind: 'sprite' as const,
          resourcePath: assetPath,
          document: {
            kind: 'sprite' as const,
            version: 1,
            width: 8,
            height: 8,
            fps: 8,
            is8x16Mode: false,
            currentFrame: 0,
            frames: [new Array(64).fill(1)],
            palette: ['#000000', '#ffffff'],
            selectedColor: 0
          }
        }
      }

      return {
        assetKind: 'tileset' as const,
        resourcePath: assetPath,
        document: {
          kind: 'tileset' as const,
          version: 1,
          tiles: [new Array(64).fill(0), new Array(64).fill(1)],
          palette: ['#000000', '#ffffff'],
          selectedColor: 0,
          selectedTileIndex: 0
        }
      }
    })

    const editor = createEditor({
      tilemapPath: 'Maps/Room.rgbtilemap.json',
      windowPath: 'Windows/HUD.rgbwindow.json',
      nodes: [
        {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: 'Sprites/Hero.rgbsprite.json',
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        }
      ]
    })

    const { result } = renderHook(() => useSceneAssetReferences('/projects/Alpha', editor))

    await waitFor(() => {
      expect(result.current.tilemapDocument).not.toBeNull()
      expect(result.current.windowDocument).not.toBeNull()
      expect(Object.keys(result.current.spritePreviews)).toEqual(['Sprites/Hero.rgbsprite.json'])
    })

    const initialLoadCount = vi.mocked(window.api.loadProjectAssetFile).mock.calls.length

    act(() => {
      savedListener?.({
        projectPath: '/projects/Alpha',
        assetPath: 'Scripts/Unrelated.rgbscript.json',
        assetKind: 'sprite'
      })
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(vi.mocked(window.api.loadProjectAssetFile).mock.calls.length).toBe(initialLoadCount)

    act(() => {
      savedListener?.({
        projectPath: '/projects/Alpha',
        assetPath: 'Maps/Room.rgbtilemap.json',
        assetKind: 'tilemap'
      })
    })

    await waitFor(() => {
      expect(vi.mocked(window.api.loadProjectAssetFile).mock.calls.length).toBeGreaterThan(
        initialLoadCount
      )
    })
  })

  it('clears references when no paths are selected', async () => {
    const editor = createEditor()
    const { result } = renderHook(() => useSceneAssetReferences('/projects/Alpha', editor))

    await waitFor(() => {
      expect(result.current.tilemapDocument).toBeNull()
      expect(result.current.windowDocument).toBeNull()
      expect(result.current.spritePreviews).toEqual({})
      expect(result.current.loadError).toBeNull()
    })
  })

  it('suggests palette 1 from a single sprite that differs from the scene sprite palette 0', async () => {
    const spritePalette = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']

    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite' as const,
      resourcePath: 'Sprites/HeroAlt.rgbsprite.json',
      document: {
        kind: 'sprite' as const,
        version: 1,
        width: 8,
        height: 8,
        fps: 8,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [new Array(64).fill(1)],
        palette: spritePalette,
        selectedColor: 0
      }
    })

    const editor = createEditor({
      spritePalettes: [['#000000', '#555555', '#aaaaaa', '#ffffff'], null],
      nodes: [
        {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: 'Sprites/HeroAlt.rgbsprite.json',
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        }
      ]
    })

    const { result } = renderHook(() => useSceneAssetReferences('/projects/Alpha', editor))

    await waitFor(() => {
      expect(result.current.defaultSpritePalettes[1]).toEqual(spritePalette)
      expect(result.current.spritePaletteMismatchPaths).toEqual([
        'Sprites/HeroAlt.rgbsprite.json'
      ])
    })
  })

  it('reports tilemap and sprite load failures and resets the affected state', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'Maps/Room.rgbtilemap.json') {
        return {
          assetKind: 'window' as const,
          resourcePath: assetPath,
          document: {
            kind: 'window' as const,
            version: 1,
            width: 20,
            height: 18,
            grid: new Array(20 * 18).fill(0),
            tilesetPath: null,
            selectedTileIndex: 0,
            tool: 'brush' as const,
            windowVisibilityBands: [{ start: 0, end: 144 }]
          }
        }
      }

      throw new Error('Sprite load failed')
    })

    const editor = createEditor({
      tilemapPath: 'Maps/Room.rgbtilemap.json',
      nodes: [
        {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: 'Sprites/Hero.rgbsprite.json',
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        }
      ]
    })

    const { result } = renderHook(() => useSceneAssetReferences('/projects/Alpha', editor))

    await waitFor(() => {
      expect(result.current.tilemapDocument).toBeNull()
      expect(result.current.spritePreviews).toEqual({})
      expect(result.current.loadError).toBe('Sprite load failed')
    })
  })
})
