import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneAssetDocument } from '../../../src/shared/projectAssets'
import { useSceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'

const createScene = (): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: null,
  windowPath: null,
  scriptPath: 'src/CustomScenes/Room.c',
  scriptProperties: {
    gravity: 2
  },
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: null,
      scriptPath: 'src/CustomActors/Hero.c',
      scriptProperties: {
        speed: 3
      },
      x: 0,
      y: 0,
      followCamera: false,
      children: []
    }
  ]
})

describe('useSceneDocumentEditor script properties', () => {
  it('tracks scene script properties through undo and redo', async () => {
    const onSceneChange = vi.fn()
    const { result } = renderHook(() =>
      useSceneDocumentEditor({ scene: createScene(), onSceneChange })
    )

    act(() => {
      result.current.setSceneScriptProperty('gravity', 12)
    })

    expect(result.current.sceneScriptProperties).toEqual({ gravity: 12 })
    expect(onSceneChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scriptProperties: {
          gravity: 12
        }
      })
    )

    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.sceneScriptProperties).toEqual({ gravity: 2 })

    await act(async () => {
      await result.current.redo()
    })

    expect(result.current.sceneScriptProperties).toEqual({ gravity: 12 })
  })

  it('tracks actor script properties through undo and redo', async () => {
    const { result } = renderHook(() =>
      useSceneDocumentEditor({ scene: createScene(), onSceneChange: vi.fn() })
    )

    act(() => {
      result.current.selectNode('hero-node')
    })

    act(() => {
      result.current.setActorScriptProperty('hero-node', 'speed', 7)
    })

    act(() => {
      result.current.setActorScriptProperty(
        'hero-node',
        'idle_animation',
        'Sprites/HeroIdle.rgbsprite.json'
      )
    })

    expect(result.current.selectedActor?.scriptProperties).toEqual({
      speed: 7,
      idle_animation: 'Sprites/HeroIdle.rgbsprite.json'
    })

    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.selectedActor?.scriptProperties).toEqual({
      speed: 7
    })

    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.selectedActor?.scriptProperties).toEqual({
      speed: 3
    })

    await act(async () => {
      await result.current.redo()
    })

    await act(async () => {
      await result.current.redo()
    })

    expect(result.current.selectedActor?.scriptProperties).toEqual({
      speed: 7,
      idle_animation: 'Sprites/HeroIdle.rgbsprite.json'
    })
  })

  it('updates collision callbacks and keeps no-op updates stable', () => {
    const scene = createScene()
    scene.nodes[0].children = [
      {
        id: 'hero-collision',
        type: 'collision',
        name: 'Hitbox',
        isCollapsed: false,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        isBlocking: true,
        callbacks: [],
        children: []
      }
    ]

    const { result } = renderHook(() =>
      useSceneDocumentEditor({ scene, onSceneChange: vi.fn() })
    )

    act(() => {
      result.current.setCollisionCallbacks('missing-node', [])
    })

    act(() => {
      result.current.setCollisionCallbacks('hero-collision', [
        {
          scriptPath: 'src/CustomActors/Hero.c',
          functionName: 'OnHeroCollision'
        }
      ])
    })

    expect(result.current.nodes[0].children[0]).toMatchObject({
      callbacks: [
        {
          scriptPath: 'src/CustomActors/Hero.c',
          functionName: 'OnHeroCollision'
        }
      ]
    })

    const callbacksBeforeNoop = result.current.nodes[0].children[0]

    act(() => {
      result.current.setCollisionCallbacks('hero-collision', [
        {
          scriptPath: 'src/CustomActors/Hero.c',
          functionName: 'OnHeroCollision'
        }
      ])
    })

    expect(result.current.nodes[0].children[0]).toBe(callbacksBeforeNoop)
  })

  it('updates tilemap and window paths, snapshots actors, and rejects invalid actor insert locations', () => {
    const scene = createScene()
    scene.nodes[0].children = [
      {
        id: 'hero-collision',
        type: 'collision',
        name: 'Hitbox',
        isCollapsed: false,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        isBlocking: true,
        callbacks: [],
        children: []
      }
    ]

    const { result } = renderHook(() =>
      useSceneDocumentEditor({ scene, onSceneChange: vi.fn() })
    )

    act(() => {
      result.current.setTilemapPath('Maps/Smaller.rgbtilemap.json', {
        width: 10,
        height: 8
      })
    })

    act(() => {
      result.current.setWindowPath('Windows/Hud.rgbwindow.json')
    })

    expect(result.current.tilemapPath).toBe('Maps/Smaller.rgbtilemap.json')
    expect(result.current.windowPath).toBe('Windows/Hud.rgbwindow.json')
    expect(result.current.snapshotActor('missing-node')).toBeNull()
    expect(result.current.snapshotActor('hero-node')).toMatchObject({
      name: 'Hero'
    })

    act(() => {
      result.current.setTilemapPath('Maps/Smaller.rgbtilemap.json', {
        width: 10,
        height: 8
      })
    })

    act(() => {
      result.current.setWindowPath('Windows/Hud.rgbwindow.json')
    })

    expect(() =>
      act(() => {
        result.current.loadActor('hero-collision', {
          id: 'enemy-node',
          type: 'actor',
          name: 'Enemy',
          isCollapsed: false,
          spritePath: null,
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        })
      })
    ).toThrow('That actor cannot be inserted at the selected location.')
  })
})
