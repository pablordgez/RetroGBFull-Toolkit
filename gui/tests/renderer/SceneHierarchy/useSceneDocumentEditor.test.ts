import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneAssetActorNode, SceneAssetDocument } from '../../../src/shared/projectAssets'
import { useSceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'

const createScene = (nodes: SceneAssetDocument['nodes']): SceneAssetDocument => {
  return {
    kind: 'scene',
    version: 1,
    tilemapPath: 'Maps/Room.rgbtilemap.json',
    windowPath: null,
    nodes
  }
}

describe('useSceneDocumentEditor', () => {
  it('undoes actor clamping together with a smaller tilemap selection', async () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 2000,
        y: 2000,
        followCamera: false,
        children: []
      }
    ])
    const onSceneChange = vi.fn()
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange }))

    act(() => {
      result.current.setTilemapPath('Maps/Small Room.rgbtilemap.json', {
        width: 10,
        height: 8
      })
    })

    expect(result.current.tilemapPath).toBe('Maps/Small Room.rgbtilemap.json')
    expect(result.current.nodes[0]).toMatchObject({
      x: 1264,
      y: 1008
    })

    await act(async () => {
      await result.current.undo()
    })

    expect(result.current.tilemapPath).toBe('Maps/Room.rgbtilemap.json')
    expect(result.current.nodes[0]).toMatchObject({
      x: 2000,
      y: 2000
    })

    await act(async () => {
      await result.current.redo()
    })

    expect(result.current.tilemapPath).toBe('Maps/Small Room.rgbtilemap.json')
    expect(result.current.nodes[0]).toMatchObject({
      x: 1264,
      y: 1008
    })
  })

  it('keeps camera follow exclusive and clears it when the followed actor is deleted', () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: false,
        children: []
      },
      {
        id: 'enemy-node',
        type: 'actor',
        name: 'Enemy',
        isCollapsed: false,
        spritePath: null,
        x: 16,
        y: 16,
        followCamera: false,
        children: []
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    act(() => {
      result.current.setFollowedActor('hero-node')
    })

    expect(result.current.nodes[0]).toMatchObject({ followCamera: true })
    expect(result.current.nodes[1]).toMatchObject({ followCamera: false })

    act(() => {
      result.current.setFollowedActor('enemy-node')
    })

    expect(result.current.nodes[0]).toMatchObject({ followCamera: false })
    expect(result.current.nodes[1]).toMatchObject({ followCamera: true })

    act(() => {
      result.current.deleteNode('enemy-node')
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0]).toMatchObject({ followCamera: false })
  })

  it('keeps direct child collisions local when an actor moves', () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 32,
        y: 64,
        followCamera: false,
        children: [
          {
            id: 'hero-collision',
            type: 'collision',
            name: 'Hitbox',
            isCollapsed: false,
            x: 48,
            y: 80,
            width: 128,
            height: 128,
            isBlocking: true,
            children: []
          }
        ]
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    act(() => {
      result.current.updateActor('hero-node', { x: 64, y: 96 })
    })

    const movedActor = result.current.nodes[0] as SceneAssetActorNode
    expect(movedActor).toMatchObject({ x: 64, y: 96 })
    expect(movedActor.children[0]).toMatchObject({
      type: 'collision',
      x: 48,
      y: 80
    })
  })

  it('updates and clamps collisions', () => {
    const scene = createScene([
      {
        id: 'collision-node',
        type: 'collision',
        name: 'Wall',
        isCollapsed: false,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        isBlocking: true,
        children: []
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    act(() => {
      result.current.updateCollision('collision-node', {
        x: 1200,
        y: 1100,
        width: 600,
        height: 600,
        isBlocking: false
      })
    })

    expect(result.current.nodes[0]).toMatchObject({
      x: 1200,
      y: 1100,
      width: 600,
      height: 600,
      isBlocking: false
    })

    act(() => {
      result.current.clampActorsToMap({
        width: 10,
        height: 8
      })
    })

    expect(result.current.nodes[0]).toMatchObject({
      x: 792,
      y: 664,
      width: 600,
      height: 600
    })
  })

  it('updates actor and collision tags with undo support', async () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: false,
        children: [
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
            children: []
          }
        ]
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    act(() => {
      result.current.setNodeTags('hero-node', ['player', 'friendly'])
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: 'actor',
      tags: ['player', 'friendly']
    })

    act(() => {
      result.current.setNodeTags('hero-collision', ['hurtbox'])
    })

    expect((result.current.nodes[0] as SceneAssetActorNode).children[0]).toMatchObject({
      type: 'collision',
      tags: ['hurtbox']
    })

    await act(async () => {
      await result.current.undo()
    })

    expect((result.current.nodes[0] as SceneAssetActorNode).children[0]).not.toHaveProperty('tags')
  })

  it('enforces collision placement rules for creation', () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: false,
        children: [
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
            children: []
          },
          {
            id: 'collision-folder',
            type: 'folder',
            name: 'Inner Folder',
            isCollapsed: false,
            children: []
          }
        ]
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    expect(result.current.canCreateNode('collision', 'hero-node')).toBe(false)
    expect(result.current.canCreateNode('collision', 'hero-collision')).toBe(false)
    expect(result.current.canCreateNode('collision', 'collision-folder')).toBe(false)
    expect(result.current.canCreateNode('collision', null)).toBe(true)
  })

  it('resets followCamera on copied actors but preserves it on cut moves', () => {
    const scene = createScene([
      {
        id: 'hero-node',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: true,
        children: []
      },
      {
        id: 'folder-node',
        type: 'folder',
        name: 'Folder',
        isCollapsed: false,
        children: []
      }
    ])
    const { result } = renderHook(() => useSceneDocumentEditor({ scene, onSceneChange: vi.fn() }))

    act(() => {
      result.current.stageClipboard('hero-node', 'copy')
    })

    act(() => {
      result.current.pasteNodes(null)
    })

    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.nodes[0]).toMatchObject({ followCamera: true })
    expect(result.current.nodes[2]).toMatchObject({ type: 'actor', followCamera: false })

    act(() => {
      result.current.stageClipboard('hero-node', 'cut')
    })

    act(() => {
      result.current.pasteNodes('folder-node')
    })

    const folderNode = result.current.nodes.find((node) => node.type === 'folder')
    expect(folderNode).toBeDefined()
    expect(folderNode).toMatchObject({ type: 'folder' })
    expect(folderNode!.children[0]).toMatchObject({ type: 'actor', followCamera: true })
  })

  it('clears followCamera while preserving collision children when loading actor resources', () => {
    const actorRoot: SceneAssetActorNode = {
      id: 'actor-root',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: null,
      x: 0,
      y: 0,
      followCamera: true,
      children: [
        {
          id: 'actor-collision',
          type: 'collision',
          name: 'Hitbox',
          isCollapsed: false,
          x: 0,
          y: 0,
          width: 128,
          height: 128,
          isBlocking: true,
          children: []
        }
      ]
    }
    const { result } = renderHook(() =>
      useSceneDocumentEditor({ scene: createScene([]), onSceneChange: vi.fn() })
    )

    act(() => {
      result.current.loadActor(null, actorRoot, { x: 160, y: 320 })
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: 'actor',
      x: 160,
      y: 320,
      followCamera: false
    })
    expect(result.current.nodes[0].children[0]).toMatchObject({
      type: 'collision',
      x: 0,
      y: 0,
      width: 128,
      height: 128
    })
  })
})
