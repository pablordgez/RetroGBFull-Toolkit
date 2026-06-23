import { describe, expect, it, vi } from 'vitest'
import type {
  SceneAssetActorNode,
  SceneAssetCollisionNode,
  SceneAssetDocument,
  SceneAssetNode
} from '../../../src/shared/projectAssets'
import {
  buildDefaultSceneNode,
  buildUniqueSceneNodeName,
  canCreateSceneNodeType,
  canInsertSceneNodeAtParent,
  clampSceneActorPosition,
  clampSceneCollisionRect,
  clearFollowCameraInSceneNodeSubtree,
  cloneSceneDocumentSnapshot,
  cloneSceneNodeWithFreshIds,
  collectSceneActorNodes,
  collectSceneCollisionNodes,
  collectSceneCollisionRenderNodes,
  findSceneNodeById,
  findSceneNodePathById,
  findSceneNodeRecord,
  formatSceneCoord,
  getSceneChildNodes,
  getSceneActorAnchorOffsetForSize,
  getDefaultSceneNodeName,
  insertSceneNode,
  isSceneActorNode,
  isSceneCollisionNode,
  isValidScenePasteTarget,
  mapSceneNodes,
  parseSceneCoord,
  pixelsToSceneCoord,
  removeSceneNodeById,
  sceneSubtreeContainsNodeId,
  sceneCoordToPixels,
  translateSceneNodeSubtreeSpatial,
  updateSceneNodeById,
  updateSceneNodeIfPresent
} from '../../../src/renderer/src/components/SceneHierarchy/sceneHierarchyModel'
import {
  buildActorResourcePathChange,
  buildActorScriptPropertyChange,
  buildActorUpdateChange,
  buildCollisionCallbacksChange,
  buildCollisionExitCallbacksChange,
  buildCollisionUpdateChange,
  buildFollowedActorChange,
  buildLoadedActorChange,
  buildSceneClipboardChange,
  buildSceneNodeDeletionChange,
  buildSceneNodeTagsChange,
  buildScenePasteChange,
  buildSceneRenameChange,
  buildSceneScriptPropertyChange,
  buildTilemapPathChange,
  clampSceneNodesToMap
} from '../../../src/renderer/src/components/SceneHierarchy/sceneDocumentEditorCommands'

const actor = (overrides: Partial<SceneAssetActorNode> = {}): SceneAssetActorNode => ({
  id: 'actor',
  type: 'actor',
  name: 'Actor',
  isCollapsed: false,
  spritePath: null,
  x: 10,
  y: 20,
  physicsMode: 'balanced',
  followCamera: false,
  spritePaletteIndex: 0,
  children: [],
  ...overrides
})

const collision = (overrides: Partial<SceneAssetCollisionNode> = {}): SceneAssetCollisionNode => ({
  id: 'collision',
  type: 'collision',
  name: 'Collision',
  isCollapsed: false,
  x: 3,
  y: 4,
  width: 32,
  height: 32,
  isBlocking: true,
  callbacks: [],
  exitCallbacks: [],
  children: [],
  ...overrides
})

const folder = (children: SceneAssetNode[] = [], id = 'folder'): SceneAssetNode => ({
  id,
  type: 'folder',
  name: 'Folder',
  isCollapsed: true,
  children
})

describe('sceneHierarchyModel edge cases', () => {
  it('clones documents, builds defaults, and formats scene coordinates', () => {
    const document: SceneAssetDocument = {
      kind: 'scene',
      version: 1,
      scriptPath: 'scene.c',
      scriptProperties: { speed: 3 },
      tilemapPath: null,
      windowPath: null,
      spritePalette: ['#FFFFFF'],
      backgroundPalette: ['bad'],
      nodes: [actor({ scriptProperties: { hp: 1 } })]
    }
    const snapshot = cloneSceneDocumentSnapshot(document)
    expect(snapshot.spritePalettes[0]).toEqual(['#ffffff', '#8bac0f', '#306230', '#0f380f'])
    expect(snapshot.backgroundPalette).toEqual(['#000000', '#8bac0f', '#306230', '#0f380f'])
    expect(snapshot.nodes[0]).not.toBe(document.nodes[0])

    expect(getSceneActorAnchorOffsetForSize(null)).toEqual({ x: 128, y: 256 })
    expect(getSceneActorAnchorOffsetForSize({ width: 16, height: 24 })).toEqual({ x: 256, y: 448 })
    expect(buildDefaultSceneNode('folder', 'Group', () => 'f')).toMatchObject({
      id: 'f',
      type: 'folder'
    })
    expect(buildDefaultSceneNode('collision', 'Hit', () => 'c')).toMatchObject({
      id: 'c',
      isBlocking: true
    })
    expect(buildDefaultSceneNode('actor', 'Hero', () => 'a')).toMatchObject({
      id: 'a',
      physicsMode: 'balanced'
    })
    expect(sceneCoordToPixels(24)).toBe(1.5)
    expect(pixelsToSceneCoord(1.5)).toBe(24)
    expect(formatSceneCoord(24)).toBe('1.5')
    expect(formatSceneCoord(24, 'core')).toBe('24')
    expect(parseSceneCoord('2.25')).toBe(36)
    expect(parseSceneCoord('36', 'core')).toBe(36)
    expect(parseSceneCoord('2.25', 'core')).toBeNull()
    expect(parseSceneCoord('nope')).toBeNull()
  })

  it('finds, updates, collects, translates, and clears scene subtrees', () => {
    const nodes = [
      folder([actor({ id: 'parent', children: [collision(), actor({ id: 'child' })] })])
    ]
    expect(findSceneNodeById(nodes, 'parent')).toMatchObject({ id: 'parent' })
    expect(findSceneNodeById(nodes, 'missing')).toBeNull()
    expect(findSceneNodeRecord(nodes, 'child')).toMatchObject({ parentId: 'parent', index: 1 })
    expect(findSceneNodeRecord(nodes, 'missing')).toBeNull()
    expect(findSceneNodePathById(nodes, 'child')?.map((node) => node.id)).toEqual([
      'folder',
      'parent',
      'child'
    ])
    expect(findSceneNodePathById(nodes, 'missing')).toBeNull()
    expect(getSceneChildNodes(nodes, null)).toBe(nodes)
    expect(getSceneChildNodes(nodes, 'missing')).toEqual([])
    expect(
      updateSceneNodeById(nodes, 'child', (node) => ({ ...node, name: 'Child 3' }))[0].children[0]
        .children[1]
    ).toMatchObject({
      name: 'Child 3'
    })
    expect(updateSceneNodeIfPresent(nodes, 'missing', vi.fn())).toMatchObject({ found: false })
    expect(
      updateSceneNodeIfPresent(nodes, 'child', (node) => ({ ...node, name: 'Child 2' }))
    ).toMatchObject({
      found: true
    })
    expect(insertSceneNode(nodes, null, actor({ id: 'root-new' }))).toHaveLength(2)
    expect(removeSceneNodeById(nodes, 'child')).toMatchObject({ parentId: 'parent' })
    expect(removeSceneNodeById(nodes, 'missing')).toBeNull()
    expect(
      mapSceneNodes(nodes, (node) => (node.id === 'child' ? { ...node, name: 'Mapped' } : node))[0]
        .children[0].children[1]
    ).toMatchObject({
      name: 'Mapped'
    })
    expect(collectSceneActorNodes(nodes).map((node) => node.id)).toEqual(['parent', 'child'])
    expect(collectSceneCollisionNodes(nodes).map((node) => node.id)).toEqual(['collision'])
    expect(collectSceneCollisionRenderNodes(nodes)).toEqual([
      expect.objectContaining({ worldX: 13, worldY: 24, parentActorId: 'parent' })
    ])
    expect(sceneSubtreeContainsNodeId(nodes[0], 'child')).toBe(true)
    expect(sceneSubtreeContainsNodeId(nodes[0], 'missing')).toBe(false)
    expect(isSceneActorNode(nodes[0])).toBe(false)
    expect(isSceneActorNode(nodes[0].children[0])).toBe(true)
    expect(isSceneCollisionNode(nodes[0].children[0].children[0])).toBe(true)

    const translated = translateSceneNodeSubtreeSpatial(nodes[0], 5, 6)
    expect(translated.children[0]).toMatchObject({ x: 15, y: 26 })
    expect(translated.children[0].children[0]).toMatchObject({ x: 3, y: 4 })
    expect(translateSceneNodeSubtreeSpatial(collision({ x: 1, y: 2 }), 3, 4)).toMatchObject({
      x: 4,
      y: 6
    })
    expect(
      clearFollowCameraInSceneNodeSubtree(folder([actor({ followCamera: true })]))
    ).toMatchObject({
      children: [expect.objectContaining({ followCamera: false })]
    })
    expect(
      clearFollowCameraInSceneNodeSubtree(actor({ followCamera: true, children: [collision()] }))
    ).toMatchObject({
      followCamera: false,
      children: [expect.objectContaining({ children: [] })]
    })

    const ids = ['new-1', 'new-2']
    expect(cloneSceneNodeWithFreshIds(nodes[0], () => ids.shift() ?? 'fallback')).toMatchObject({
      id: 'new-1',
      children: [expect.objectContaining({ id: 'new-2' })]
    })
    expect(
      buildUniqueSceneNodeName(
        [actor({ name: 'Actor' }), actor({ id: 'keep', name: 'Actor 2' })],
        'Actor',
        'keep'
      )
    ).toBe('Actor 2')
    expect(getDefaultSceneNodeName('actor')).toBe('Actor')
    expect(getDefaultSceneNodeName('collision')).toBe('Collision')
    expect(getDefaultSceneNodeName('folder')).toBe('Folder')
    expect(clampSceneActorPosition(-1000, 99999, null)).toEqual({ x: -128, y: 65535 })
    expect(clampSceneCollisionRect(-5, 70000, 1, 70000, null)).toEqual({
      x: 0,
      y: 0,
      width: 16,
      height: 65535
    })
  })

  it('validates scene insertion and paste targets', () => {
    const parent = actor({ id: 'parent', children: [collision({ id: 'existing-collider' })] })
    const nestedActor = actor({
      id: 'nested',
      children: [collision({ id: 'c1' }), collision({ id: 'c2' })]
    })
    const nodes = [folder([parent]), collision({ id: 'root-collider' })]

    expect(canInsertSceneNodeAtParent(nodes, 'missing', actor())).toBe(false)
    expect(canInsertSceneNodeAtParent(nodes, 'root-collider', actor())).toBe(false)
    expect(canInsertSceneNodeAtParent(nodes, 'parent', collision({ id: 'new-collider' }))).toBe(
      false
    )
    expect(canInsertSceneNodeAtParent(nodes, null, nestedActor)).toBe(false)
    expect(canCreateSceneNodeType(nodes, null, 'folder')).toBe(true)
    expect(isValidScenePasteTarget(nodes, null, null)).toBe(false)
    expect(
      isValidScenePasteTarget(
        nodes,
        { operation: 'copy', node: actor({ id: 'copy' }), sourceNodeId: null },
        null
      )
    ).toBe(true)
    expect(
      isValidScenePasteTarget(nodes, { operation: 'cut', node: actor(), sourceNodeId: null }, null)
    ).toBe(false)
    expect(
      isValidScenePasteTarget(
        nodes,
        { operation: 'cut', node: parent, sourceNodeId: 'parent' },
        'parent'
      )
    ).toBe(false)
    expect(
      isValidScenePasteTarget(
        nodes,
        { operation: 'cut', node: parent, sourceNodeId: 'parent' },
        'missing'
      )
    ).toBe(false)
  })
})

describe('sceneDocumentEditorCommands edge cases', () => {
  it('clamps nodes, edits actors/collisions, and ignores no-op changes', () => {
    const nodes = [
      actor({
        id: 'parent',
        x: 2000,
        y: 2000,
        children: [collision({ id: 'hit', x: 100, y: 100, width: 2000, height: 1 })]
      })
    ]
    const clamped = clampSceneNodesToMap(nodes, { width: 4, height: 4 })
    expect(clamped[0]).toMatchObject({ x: 496, y: 496 })
    expect(clamped[0].children[0]).toMatchObject({ x: -496, y: 0, width: 512, height: 16 })
    expect(buildTilemapPathChange(nodes)).toBe(nodes)

    expect(buildActorUpdateChange(nodes, 'missing', { x: 1 })).toBeNull()
    expect(buildActorUpdateChange(nodes, 'parent', {})).toBeNull()
    expect(buildActorUpdateChange(nodes, 'parent', { x: 2010, y: 2020 })?.nodes[0]).toMatchObject({
      x: 2010,
      y: 2020
    })
    expect(
      buildCollisionUpdateChange(nodes, 'hit', { x: 2015, y: 2025, isBlocking: false })?.nodes[0]
        .children[0]
    ).toMatchObject({
      x: 15,
      y: 25,
      isBlocking: false
    })
    expect(buildCollisionUpdateChange(nodes, 'missing', { x: 0 })).toBeNull()
  })

  it('builds clipboard, paste, rename, tag, resource, script, and callback changes', () => {
    const nodes = [
      folder([
        actor({
          id: 'actor',
          name: 'Actor',
          followCamera: true,
          tags: ['old'],
          children: [collision({ id: 'hit' })]
        })
      ])
    ]

    expect(
      buildSceneNodeDeletionChange(
        nodes,
        { operation: 'cut', node: nodes[0], sourceNodeId: 'actor' },
        'folder'
      )?.clipboard
    ).toBeNull()
    expect(buildSceneNodeDeletionChange(nodes, null, 'missing')).toBeNull()
    expect(buildSceneClipboardChange(nodes, 'actor', 'copy')?.clipboard?.node).toMatchObject({
      followCamera: false
    })
    expect(buildSceneClipboardChange(nodes, 'missing', 'copy')).toBeNull()
    expect(
      buildScenePasteChange(
        nodes,
        { operation: 'cut', node: nodes[0], sourceNodeId: 'missing' },
        null
      )
    ).toBeNull()
    expect(
      buildScenePasteChange(
        nodes,
        { operation: 'copy', node: actor({ name: 'Actor' }), sourceNodeId: null },
        'folder'
      )?.selectedNodeId
    ).toBeTruthy()

    expect(
      buildSceneRenameChange(nodes, {
        nodeId: 'actor',
        originalName: 'Actor',
        draftName: ' Actor '
      })
    ).toBeNull()
    expect(
      buildSceneRenameChange(nodes, { nodeId: 'missing', originalName: 'Actor', draftName: 'New' })
    ).toBeNull()
    expect(
      buildSceneRenameChange(nodes, { nodeId: 'actor', originalName: 'Actor', draftName: 'Folder' })
        ?.nodes[0].children[0]
    ).toMatchObject({ name: 'Folder' })

    expect(buildSceneNodeTagsChange(nodes, 'folder', ['a'])).toBeNull()
    expect(buildSceneNodeTagsChange(nodes, 'actor', [])?.nodes[0].children[0]).toMatchObject({
      tags: undefined
    })
    expect(buildSceneScriptPropertyChange({ hp: 1 }, 'hp', 1)).toBeNull()
    expect(buildSceneScriptPropertyChange(undefined, 'hp', 2)).toEqual({ hp: 2 })
    expect(buildFollowedActorChange(nodes, 'missing', null)).toBeNull()
    expect(buildFollowedActorChange(nodes, null, 'actor')?.selectedNodeId).toBe('actor')
    expect(buildActorResourcePathChange(nodes, 'missing', 'actor.rgbactor.json')).toBeNull()
    expect(buildActorResourcePathChange(nodes, 'actor', null)).toBeNull()
    expect(
      buildActorResourcePathChange(nodes, 'actor', 'actor.rgbactor.json')?.[0].children[0]
    ).toMatchObject({
      resourcePath: 'actor.rgbactor.json'
    })
    expect(buildActorScriptPropertyChange(nodes, 'actor', 'hp', 1)?.selectedNodeId).toBe('actor')
    expect(
      buildActorScriptPropertyChange(nodes, 'actor', 'hp', 1)?.nodes[0].children[0]
    ).toMatchObject({
      scriptProperties: { hp: 1 }
    })

    const callback = { scriptPath: 'script.c', functionName: 'OnHit' }
    expect(buildCollisionCallbacksChange(nodes, 'actor', [callback])).toBeNull()
    expect(buildCollisionCallbacksChange(nodes, 'hit', [])).toBeNull()
    expect(
      buildCollisionCallbacksChange(nodes, 'hit', [callback])?.nodes[0].children[0].children[0]
    ).toMatchObject({
      callbacks: [callback]
    })
    expect(buildCollisionExitCallbacksChange(nodes, 'hit', [callback])?.selectedNodeId).toBe('hit')
  })

  it('loads actor resources with placement and rejects invalid parents', () => {
    const nodes = [actor({ id: 'parent', children: [collision({ id: 'hit' })] })]
    const loaded = buildLoadedActorChange(
      nodes,
      null,
      actor({ id: 'source', name: 'Actor', x: 1, y: 2, followCamera: true }),
      {
        x: 10,
        y: 20
      },
      'Actors/Hero.rgbactor.json'
    )
    expect(loaded.nodes[1]).toMatchObject({
      name: 'Actor 2',
      x: 10,
      y: 20,
      followCamera: false,
      resourcePath: 'Actors/Hero.rgbactor.json'
    })

    expect(() =>
      buildLoadedActorChange(
        nodes,
        'parent',
        actor({ children: [collision({ id: 'c1' }), collision({ id: 'c2' })] })
      )
    ).toThrow('That actor cannot be inserted at the selected location.')
  })
})
