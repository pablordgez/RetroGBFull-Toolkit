import type {
  SceneAssetActorNode,
  SceneAssetCollisionNode,
  SceneAssetDocument,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import type {
  ScriptPropertyMap,
  ScriptPropertyValue
} from '../../../../shared/projectScriptProperties'
import {
  type SceneSpritePalettes,
  normalizeProjectPalette,
  normalizeSceneSpritePalettes
} from '../../../../shared/projectPalettes'

export type SceneHierarchyClipboardOperation = 'copy' | 'cut'

export interface SceneHierarchyClipboardState {
  operation: SceneHierarchyClipboardOperation
  node: SceneAssetNode
  sourceNodeId: string | null
}

export interface SceneHierarchyHistoryState {
  scriptPath: string | null
  scriptProperties?: ScriptPropertyMap
  tilemapPath: string | null
  windowPath: string | null
  spritePalettes: SceneSpritePalettes
  backgroundPalette: string[] | null
  nodes: SceneAssetNode[]
  selectedNodeId: string | null
  clipboard: SceneHierarchyClipboardState | null
}

export interface EditingSceneNodeState {
  nodeId: string
  draftName: string
  originalName: string
}

export interface SceneNodeRecord {
  node: SceneAssetNode
  parentId: string | null
  index: number
}

export interface SceneEditorDocumentSnapshot {
  scriptPath: string | null
  scriptProperties?: ScriptPropertyMap
  tilemapPath: string | null
  windowPath: string | null
  spritePalettes: SceneSpritePalettes
  backgroundPalette: string[] | null
  nodes: SceneAssetNode[]
}

export interface SceneCollisionRenderNode {
  node: SceneAssetCollisionNode
  worldX: number
  worldY: number
  parentActorId: string | null
}

interface SceneNodePlacementContext {
  parentType: SceneAssetNode['type'] | null
  insideActorSubtree: boolean
}

const SCENE_COORD_SCALE = 16
const SCENE_COORD_MAX = 0xffff
const SCENE_COLLISION_MIN_SIZE = SCENE_COORD_SCALE
export const DEFAULT_SCENE_COLLISION_SIZE = 8 * SCENE_COORD_SCALE
export type SceneCoordinateUnit = 'gui' | 'core'

export interface SceneActorAnchorOffset {
  x: number
  y: number
}

export const getSceneActorAnchorOffsetForSize = (
  spriteSize?: { width: number; height: number } | null
): SceneActorAnchorOffset => {
  if (!spriteSize || (spriteSize.width === 8 && spriteSize.height === 8)) {
    return {
      x: 8 * SCENE_COORD_SCALE,
      y: 16 * SCENE_COORD_SCALE
    }
  }

  return {
    x: (Math.floor(spriteSize.width / 2) + 8) * SCENE_COORD_SCALE,
    y: (Math.floor(spriteSize.height / 2) + 16) * SCENE_COORD_SCALE
  }
}

export const getDefaultSceneNodeName = (type: SceneAssetNode['type']): string => {
  switch (type) {
    case 'actor':
      return 'Actor'
    case 'collision':
      return 'Collision'
    default:
      return 'Folder'
  }
}

export const cloneSceneNodeSnapshot = (node: SceneAssetNode): SceneAssetNode => {
  return {
    ...node,
    ...('scriptProperties' in node && node.scriptProperties
      ? {
          scriptProperties: { ...node.scriptProperties }
        }
      : {}),
    children: node.children.map(cloneSceneNodeSnapshot)
  }
}

export const cloneSceneDocumentSnapshot = (
  document: SceneAssetDocument | SceneEditorDocumentSnapshot
): SceneEditorDocumentSnapshot => {
  return {
    scriptPath: document.scriptPath,
    ...(document.scriptProperties ? { scriptProperties: { ...document.scriptProperties } } : {}),
    tilemapPath: document.tilemapPath,
    windowPath: document.windowPath,
    spritePalettes: document.spritePalettes
      ? normalizeSceneSpritePalettes(document.spritePalettes)
      : [
          'spritePalette' in document && document.spritePalette
            ? normalizeProjectPalette(document.spritePalette)
            : null,
          null
        ],
    backgroundPalette: document.backgroundPalette
      ? normalizeProjectPalette(document.backgroundPalette)
      : null,
    nodes: document.nodes.map(cloneSceneNodeSnapshot)
  }
}

export const createSceneNodeId = (): string => {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `scene-node-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

export const isSceneActorNode = (node: SceneAssetNode): node is SceneAssetActorNode => {
  return node.type === 'actor'
}

export const isSceneCollisionNode = (node: SceneAssetNode): node is SceneAssetCollisionNode => {
  return node.type === 'collision'
}

export const findSceneNodeById = (
  nodes: SceneAssetNode[],
  nodeId: string
): SceneAssetNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }

    const nestedMatch = findSceneNodeById(node.children, nodeId)

    if (nestedMatch) {
      return nestedMatch
    }
  }

  return null
}

export const findSceneNodeRecord = (
  nodes: SceneAssetNode[],
  nodeId: string,
  parentId: string | null = null
): SceneNodeRecord | null => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]

    if (node.id === nodeId) {
      return { node, parentId, index }
    }

    const nestedRecord = findSceneNodeRecord(node.children, nodeId, node.id)

    if (nestedRecord) {
      return nestedRecord
    }
  }

  return null
}

export const findSceneNodePathById = (
  nodes: SceneAssetNode[],
  nodeId: string
): SceneAssetNode[] | null => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return [node]
    }

    const nestedPath = findSceneNodePathById(node.children, nodeId)

    if (nestedPath) {
      return [node, ...nestedPath]
    }
  }

  return null
}

export const getSceneChildNodes = (
  nodes: SceneAssetNode[],
  parentId: string | null
): SceneAssetNode[] => {
  if (!parentId) {
    return nodes
  }

  return findSceneNodeById(nodes, parentId)?.children ?? []
}

export const updateSceneNodeById = (
  nodes: SceneAssetNode[],
  nodeId: string,
  updater: (node: SceneAssetNode) => SceneAssetNode
): SceneAssetNode[] => {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return updater(node)
    }

    if (node.children.length === 0) {
      return node
    }

    const nextChildren = updateSceneNodeById(node.children, nodeId, updater)

    return nextChildren === node.children ? node : { ...node, children: nextChildren }
  })
}

export const updateSceneNodeIfPresent = (
  nodes: SceneAssetNode[],
  nodeId: string,
  updater: (node: SceneAssetNode) => SceneAssetNode
): { nodes: SceneAssetNode[]; found: boolean } => {
  let found = false

  const nextNodes = nodes.map((node) => {
    if (node.id === nodeId) {
      found = true
      return updater(node)
    }

    if (node.children.length === 0) {
      return node
    }

    const nestedResult = updateSceneNodeIfPresent(node.children, nodeId, updater)

    if (!nestedResult.found) {
      return node
    }

    found = true
    return { ...node, children: nestedResult.nodes }
  })

  return { nodes: nextNodes, found }
}

export const insertSceneNode = (
  nodes: SceneAssetNode[],
  parentId: string | null,
  nextNode: SceneAssetNode
): SceneAssetNode[] => {
  if (!parentId) {
    return [...nodes, nextNode]
  }

  return updateSceneNodeById(nodes, parentId, (node) => ({
    ...node,
    isCollapsed: false,
    children: [...node.children, nextNode]
  }))
}

export const removeSceneNodeById = (
  nodes: SceneAssetNode[],
  nodeId: string,
  parentId: string | null = null
): {
  nodes: SceneAssetNode[]
  removedNode: SceneAssetNode
  parentId: string | null
} | null => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]

    if (node.id === nodeId) {
      return {
        nodes: [...nodes.slice(0, index), ...nodes.slice(index + 1)],
        removedNode: node,
        parentId
      }
    }

    const nestedRemoval = removeSceneNodeById(node.children, nodeId, node.id)

    if (nestedRemoval) {
      return {
        nodes: [
          ...nodes.slice(0, index),
          { ...node, children: nestedRemoval.nodes },
          ...nodes.slice(index + 1)
        ],
        removedNode: nestedRemoval.removedNode,
        parentId: nestedRemoval.parentId
      }
    }
  }

  return null
}

export const mapSceneNodes = (
  nodes: SceneAssetNode[],
  mapper: (node: SceneAssetNode) => SceneAssetNode
): SceneAssetNode[] => {
  return nodes.map((node) => {
    const mappedNode = mapper(node)

    if (mappedNode.children.length === 0) {
      return mappedNode
    }

    const nextChildren = mapSceneNodes(mappedNode.children, mapper)
    const childrenChanged = nextChildren.some(
      (childNode, index) => childNode !== mappedNode.children[index]
    )

    return childrenChanged ? { ...mappedNode, children: nextChildren } : mappedNode
  })
}

export const translateSceneNodeSubtreeSpatial = (
  node: SceneAssetNode,
  deltaX: number,
  deltaY: number,
  isDirectChildOfActor = false
): SceneAssetNode => {
  const nextNode =
    node.type === 'actor' || (node.type === 'collision' && !isDirectChildOfActor)
      ? {
          ...node,
          x: node.x + deltaX,
          y: node.y + deltaY
        }
      : node

  if (nextNode.children.length === 0) {
    return nextNode
  }

  return {
    ...nextNode,
    children: nextNode.children.map((childNode) =>
      translateSceneNodeSubtreeSpatial(childNode, deltaX, deltaY, nextNode.type === 'actor')
    )
  }
}

export const collectSceneActorNodes = (nodes: SceneAssetNode[]): SceneAssetActorNode[] => {
  return nodes.flatMap((node) => {
    const descendants = collectSceneActorNodes(node.children)
    return isSceneActorNode(node) ? [node, ...descendants] : descendants
  })
}

export const collectSceneCollisionNodes = (nodes: SceneAssetNode[]): SceneAssetCollisionNode[] => {
  return nodes.flatMap((node) => {
    const descendants = collectSceneCollisionNodes(node.children)
    return isSceneCollisionNode(node) ? [node, ...descendants] : descendants
  })
}

export const collectSceneCollisionRenderNodes = (
  nodes: SceneAssetNode[],
  parentActor: SceneAssetActorNode | null = null
): SceneCollisionRenderNode[] => {
  return nodes.flatMap((node) => {
    if (isSceneCollisionNode(node)) {
      return [
        {
          node,
          worldX: node.x + (parentActor?.x ?? 0),
          worldY: node.y + (parentActor?.y ?? 0),
          parentActorId: parentActor?.id ?? null
        }
      ]
    }

    return collectSceneCollisionRenderNodes(node.children, isSceneActorNode(node) ? node : null)
  })
}

export const sceneSubtreeContainsNodeId = (node: SceneAssetNode, nodeId: string): boolean => {
  if (node.id === nodeId) {
    return true
  }

  return node.children.some((childNode) => sceneSubtreeContainsNodeId(childNode, nodeId))
}

export const buildUniqueSceneNodeName = (
  siblings: SceneAssetNode[],
  preferredName: string,
  excludedNodeId?: string
): string => {
  const existingNames = new Set(
    siblings
      .filter((node) => node.id !== excludedNodeId)
      .map((node) => node.name.toLocaleLowerCase())
  )

  if (!existingNames.has(preferredName.toLocaleLowerCase())) {
    return preferredName
  }

  let suffix = 2

  while (existingNames.has(`${preferredName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1
  }

  return `${preferredName} ${suffix}`
}

export const cloneSceneNodeWithFreshIds = (
  node: SceneAssetNode,
  createNodeId: () => string
): SceneAssetNode => {
  return {
    ...node,
    id: createNodeId(),
    children: node.children.map((childNode) => cloneSceneNodeWithFreshIds(childNode, createNodeId))
  }
}

export const clearFollowCameraInSceneNodeSubtree = (node: SceneAssetNode): SceneAssetNode => {
  if (node.type === 'folder') {
    return {
      ...node,
      children: node.children.map(clearFollowCameraInSceneNodeSubtree)
    }
  }

  if (node.type === 'collision') {
    return {
      ...node,
      children: []
    }
  }

  return {
    ...node,
    followCamera: false,
    children: node.children.map(clearFollowCameraInSceneNodeSubtree)
  }
}

export const buildDefaultSceneNode = (
  type: SceneAssetNode['type'],
  name: string,
  createNodeId: () => string = createSceneNodeId
): SceneAssetNode => {
  if (type === 'folder') {
    return {
      id: createNodeId(),
      type,
      name,
      isCollapsed: false,
      children: []
    }
  }

  if (type === 'collision') {
    return {
      id: createNodeId(),
      type,
      name,
      isCollapsed: false,
      x: 0,
      y: 0,
      width: DEFAULT_SCENE_COLLISION_SIZE,
      height: DEFAULT_SCENE_COLLISION_SIZE,
      isBlocking: true,
      callbacks: [],
      exitCallbacks: [],
      children: []
    }
  }

  return {
    id: createNodeId(),
    type,
    name,
    isCollapsed: false,
    spritePath: null,
    x: 0,
    y: 0,
    physicsMode: 'balanced',
    followCamera: false,
    spritePaletteIndex: 0,
    children: []
  }
}

export const mergeScriptPropertyValue = (
  properties: ScriptPropertyMap | undefined,
  propertyName: string,
  propertyValue: ScriptPropertyValue
): ScriptPropertyMap => {
  return {
    ...(properties ?? {}),
    [propertyName]: propertyValue
  }
}

export const clampSceneActorCoordinate = (
  value: number,
  mapTileCount: number | null,
  edgePadding: number,
  anchorOffset: number
): number => {
  const minCoordinate = -anchorOffset
  const maxCoordinate =
    mapTileCount === null
      ? SCENE_COORD_MAX
      : Math.max(minCoordinate, (((mapTileCount << 3) + edgePadding) << 4) - anchorOffset)

  return Math.max(minCoordinate, Math.min(SCENE_COORD_MAX, Math.round(value), maxCoordinate))
}

export const clampSceneActorPosition = (
  x: number,
  y: number,
  mapSize?: {
    width: number
    height: number
  } | null,
  anchorOffset = getSceneActorAnchorOffsetForSize()
): { x: number; y: number } => {
  return {
    x: clampSceneActorCoordinate(x, mapSize?.width ?? null, 7, anchorOffset.x),
    y: clampSceneActorCoordinate(y, mapSize?.height ?? null, 15, anchorOffset.y)
  }
}

const getSceneCollisionAxisExtent = (mapTileCount: number | null): number => {
  return mapTileCount === null ? SCENE_COORD_MAX : (mapTileCount << 3) << 4
}

const clampSceneCollisionSize = (value: number, axisExtent: number): number => {
  return Math.max(
    SCENE_COLLISION_MIN_SIZE,
    Math.min(Math.round(value), Math.max(SCENE_COLLISION_MIN_SIZE, axisExtent))
  )
}

const clampSceneCollisionOrigin = (value: number, span: number, axisExtent: number): number => {
  const maxCoordinate = Math.max(0, axisExtent - span)
  return Math.max(0, Math.min(SCENE_COORD_MAX, Math.round(value), maxCoordinate))
}

export const clampSceneCollisionRect = (
  x: number,
  y: number,
  width: number,
  height: number,
  mapSize?: {
    width: number
    height: number
  } | null
): { x: number; y: number; width: number; height: number } => {
  const axisWidth = getSceneCollisionAxisExtent(mapSize?.width ?? null)
  const axisHeight = getSceneCollisionAxisExtent(mapSize?.height ?? null)
  const nextWidth = clampSceneCollisionSize(width, axisWidth)
  const nextHeight = clampSceneCollisionSize(height, axisHeight)
  const nextX = clampSceneCollisionOrigin(x, nextWidth, axisWidth)
  const nextY = clampSceneCollisionOrigin(y, nextHeight, axisHeight)

  return {
    x: nextX,
    y: nextY,
    width: clampSceneCollisionSize(
      nextWidth,
      Math.max(SCENE_COLLISION_MIN_SIZE, axisWidth - nextX)
    ),
    height: clampSceneCollisionSize(
      nextHeight,
      Math.max(SCENE_COLLISION_MIN_SIZE, axisHeight - nextY)
    )
  }
}

export const sceneCoordToPixels = (value: number): number => {
  return value / SCENE_COORD_SCALE
}

export const pixelsToSceneCoord = (value: number): number => {
  return Math.round(value * SCENE_COORD_SCALE)
}

export const formatSceneCoord = (value: number, unit: SceneCoordinateUnit = 'gui'): string => {
  if (unit === 'core') {
    return String(Math.round(value))
  }

  return (value / SCENE_COORD_SCALE).toFixed(4).replace(/\.?0+$/, '')
}

export const parseSceneCoord = (
  value: string,
  unit: SceneCoordinateUnit = 'gui'
): number | null => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return null
  }

  if (unit === 'core') {
    return Number.isInteger(parsedValue) ? parsedValue : null
  }

  return pixelsToSceneCoord(parsedValue)
}

const isValidSceneNodeSubtreeForPlacement = (
  node: SceneAssetNode,
  context: SceneNodePlacementContext
): boolean => {
  if (node.type === 'collision') {
    return (
      node.children.length === 0 &&
      (context.parentType === null ||
        context.parentType === 'folder' ||
        context.parentType === 'actor') &&
      (!context.insideActorSubtree || context.parentType === 'actor')
    )
  }

  if (node.type === 'actor') {
    const directCollisionChildren = node.children.filter(isSceneCollisionNode).length

    if (directCollisionChildren > 1) {
      return false
    }
  }

  const nextInsideActorSubtree = context.insideActorSubtree || node.type === 'actor'

  return node.children.every((childNode) =>
    isValidSceneNodeSubtreeForPlacement(childNode, {
      parentType: node.type,
      insideActorSubtree: nextInsideActorSubtree
    })
  )
}

export const canInsertSceneNodeAtParent = (
  nodes: SceneAssetNode[],
  parentId: string | null,
  nextNode: SceneAssetNode
): boolean => {
  const parentNode = parentId ? findSceneNodeById(nodes, parentId) : null

  if (parentId && !parentNode) {
    return false
  }

  if (parentNode?.type === 'collision') {
    return false
  }

  if (parentNode?.type === 'actor' && nextNode.type === 'collision') {
    if (parentNode.children.some(isSceneCollisionNode)) {
      return false
    }
  }

  const parentPath = parentId ? findSceneNodePathById(nodes, parentId) : null
  const insideActorSubtree = parentPath
    ? parentPath.some((pathNode) => pathNode.type === 'actor')
    : false

  return isValidSceneNodeSubtreeForPlacement(nextNode, {
    parentType: parentNode?.type ?? null,
    insideActorSubtree
  })
}

export const canCreateSceneNodeType = (
  nodes: SceneAssetNode[],
  parentId: string | null,
  type: SceneAssetNode['type']
): boolean => {
  return canInsertSceneNodeAtParent(
    nodes,
    parentId,
    buildDefaultSceneNode(type, getDefaultSceneNodeName(type))
  )
}

export const isValidScenePasteTarget = (
  nodes: SceneAssetNode[],
  clipboard: SceneHierarchyClipboardState | null,
  targetParentId: string | null
): boolean => {
  if (!clipboard) {
    return false
  }

  if (clipboard.operation === 'copy') {
    return canInsertSceneNodeAtParent(nodes, targetParentId, clipboard.node)
  }

  if (!clipboard.sourceNodeId) {
    return false
  }

  if (!targetParentId) {
    const removal = removeSceneNodeById(nodes, clipboard.sourceNodeId)
    return removal ? canInsertSceneNodeAtParent(removal.nodes, null, removal.removedNode) : false
  }

  if (targetParentId === clipboard.sourceNodeId) {
    return false
  }

  const sourceNode = findSceneNodeById(nodes, clipboard.sourceNodeId)

  if (!sourceNode || sceneSubtreeContainsNodeId(sourceNode, targetParentId)) {
    return false
  }

  const removal = removeSceneNodeById(nodes, clipboard.sourceNodeId)

  if (!removal) {
    return false
  }

  return canInsertSceneNodeAtParent(removal.nodes, targetParentId, removal.removedNode)
}
