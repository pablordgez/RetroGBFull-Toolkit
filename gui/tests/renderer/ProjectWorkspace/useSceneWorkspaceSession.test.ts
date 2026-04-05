import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneAssetDocument } from '../../../src/shared/projectAssets'
import { useSceneWorkspaceSession } from '../../../src/renderer/src/components/ProjectWorkspace/useSceneWorkspaceSession'

const createSceneDocument = (
  overrides: Partial<SceneAssetDocument> = {}
): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: 'Maps/Room.rgbtilemap.json',
  windowPath: 'Windows/HUD.rgbwindow.json',
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      resourcePath: 'Actors/Hero.rgbactor.json',
      spritePath: 'Sprites/Hero.rgbsprite.json',
      x: 0,
      y: 0,
      followCamera: false,
      children: []
    }
  ],
  ...overrides
})

describe('useSceneWorkspaceSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens scenes, prompts when switching away from dirty work, and saves before loading the next scene', async () => {
    const onError = vi.fn()
    const firstScene = createSceneDocument()
    const secondScene = createSceneDocument({
      tilemapPath: 'Maps/Cave.rgbtilemap.json',
      nodes: []
    })

    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'Scenes/First.rgbscene.json') {
        return {
          assetKind: 'scene' as const,
          resourcePath: assetPath,
          document: firstScene
        }
      }

      return {
        assetKind: 'scene' as const,
        resourcePath: assetPath,
        document: secondScene
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath, document) => ({
        assetKind: 'scene' as const,
        resourcePath: assetPath,
        document
      })
    )

    const { result } = renderHook(() =>
      useSceneWorkspaceSession({
        projectPath: '/projects/Alpha',
        onError
      })
    )

    await act(async () => {
      await result.current.openScene('Scenes/First.rgbscene.json')
    })

    expect(result.current.activeScenePath).toBe('Scenes/First.rgbscene.json')
    expect(result.current.activeSceneLabel).toBe('First')
    expect(result.current.isSceneDirty).toBe(false)

    act(() => {
      result.current.updateSceneDocument(
        createSceneDocument({
          nodes: [
            {
              id: 'hero-node',
              type: 'actor',
              name: 'Hero',
              isCollapsed: false,
              resourcePath: 'Actors/Hero.rgbactor.json',
              spritePath: 'Sprites/Hero.rgbsprite.json',
              x: 16,
              y: 0,
              followCamera: false,
              children: []
            }
          ]
        })
      )
    })

    expect(result.current.isSceneDirty).toBe(true)

    await act(async () => {
      await result.current.openScene('Scenes/Second.rgbscene.json')
    })

    expect(result.current.isSceneClosePromptOpen).toBe(true)
    expect(result.current.activeScenePath).toBe('Scenes/First.rgbscene.json')

    await act(async () => {
      await result.current.handleSceneCloseDecision('cancel')
    })

    expect(result.current.isSceneClosePromptOpen).toBe(false)
    expect(result.current.activeScenePath).toBe('Scenes/First.rgbscene.json')

    await act(async () => {
      await result.current.openScene('Scenes/Second.rgbscene.json')
    })

    await act(async () => {
      await result.current.handleSceneCloseDecision('save')
    })

    await waitFor(() => {
      expect(result.current.activeScenePath).toBe('Scenes/Second.rgbscene.json')
    })
    expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
      '/projects/Alpha',
      'Scenes/First.rgbscene.json',
      expect.objectContaining({
        kind: 'scene',
        nodes: [expect.objectContaining({ x: 16 })]
      })
    )
    expect(result.current.sceneStatusMessage).toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  it('remaps scene and referenced asset paths after tracked resource mutations', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'scene',
      resourcePath: 'Scenes/First.rgbscene.json',
      document: createSceneDocument()
    })

    const { result } = renderHook(() =>
      useSceneWorkspaceSession({
        projectPath: '/projects/Alpha',
        onError: vi.fn()
      })
    )

    await act(async () => {
      await result.current.openScene('Scenes/First.rgbscene.json')
    })

    act(() => {
      result.current.handleTrackedResourceMutation({
        action: 'rename',
        resourceType: 'scene',
        resourcePath: 'Scenes/Renamed.rgbscene.json',
        previousResourcePath: 'Scenes/First.rgbscene.json'
      })
    })

    expect(result.current.activeScenePath).toBe('Scenes/Renamed.rgbscene.json')

    act(() => {
      result.current.handleTrackedResourceMutation({
        action: 'move',
        resourceType: 'tilemap',
        resourcePath: 'Maps/Archive/Room.rgbtilemap.json',
        previousResourcePath: 'Maps/Room.rgbtilemap.json'
      })
    })

    act(() => {
      result.current.handleTrackedResourceMutation({
        action: 'delete',
        resourceType: 'window',
        resourcePath: 'Windows/HUD.rgbwindow.json'
      })
    })

    act(() => {
      result.current.handleTrackedResourceMutation({
        action: 'rename',
        resourceType: 'sprite',
        resourcePath: 'Sprites/Hero Idle.rgbsprite.json',
        previousResourcePath: 'Sprites/Hero.rgbsprite.json'
      })
    })

    expect(result.current.activeSceneDocument).toMatchObject({
      tilemapPath: 'Maps/Archive/Room.rgbtilemap.json',
      windowPath: null,
      nodes: [
        expect.objectContaining({
          spritePath: 'Sprites/Hero Idle.rgbsprite.json'
        })
      ]
    })
    expect(result.current.isSceneDirty).toBe(true)
  })

  it('closes the active scene when the scene or a parent folder is deleted', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'scene',
      resourcePath: 'Scenes/Folder/First.rgbscene.json',
      document: createSceneDocument()
    })

    const { result } = renderHook(() =>
      useSceneWorkspaceSession({
        projectPath: '/projects/Alpha',
        onError: vi.fn()
      })
    )

    await act(async () => {
      await result.current.openScene('Scenes/Folder/First.rgbscene.json')
    })

    act(() => {
      result.current.handleTrackedResourceMutation({
        action: 'delete',
        resourceType: 'folder',
        resourcePath: 'Scenes'
      })
    })

    expect(result.current.activeScenePath).toBeNull()
    expect(result.current.activeSceneDocument).toBeNull()
    expect(result.current.sceneStatusMessage).toBeNull()
  })

  it('reports load and save errors and clears the session when the project changes', async () => {
    const onError = vi.fn()

    vi.mocked(window.api.loadProjectAssetFile)
      .mockResolvedValueOnce({
        assetKind: 'tilemap',
        resourcePath: 'Scenes/Bad.rgbscene.json',
        document: {
          kind: 'tilemap',
          version: 1,
          width: 1,
          height: 1,
          grid: [0],
          tilesetPath: null,
          selectedTileIndex: 0,
          tool: 'brush'
        }
      })
      .mockResolvedValueOnce({
        assetKind: 'scene',
        resourcePath: 'Scenes/Good.rgbscene.json',
        document: createSceneDocument()
      })
    vi.mocked(window.api.saveProjectAssetFile).mockRejectedValueOnce(new Error('Save failed'))

    const { result, rerender } = renderHook(
      ({ projectPath }) =>
        useSceneWorkspaceSession({
          projectPath,
          onError
        }),
      {
        initialProps: { projectPath: '/projects/Alpha' }
      }
    )

    await act(async () => {
      await result.current.openScene('Scenes/Bad.rgbscene.json')
    })

    expect(onError).toHaveBeenCalledWith('Expected a scene asset but received a tilemap asset.')
    expect(result.current.activeScenePath).toBeNull()

    await act(async () => {
      await result.current.openScene('Scenes/Good.rgbscene.json')
    })

    await act(async () => {
      await result.current.saveActiveScene()
    })

    expect(onError).toHaveBeenCalledWith('Save failed')

    rerender({ projectPath: '/projects/Beta' })

    expect(result.current.activeScenePath).toBeNull()
    expect(result.current.activeSceneDocument).toBeNull()
  })
})
