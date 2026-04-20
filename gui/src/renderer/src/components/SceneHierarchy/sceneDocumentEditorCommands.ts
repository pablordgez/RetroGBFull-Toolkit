import type {
  SceneAssetActorNode,
  SceneAssetCollisionCallback,
  SceneAssetCollisionNode,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import type {
  ScriptPropertyMap,
  ScriptPropertyValue
} from '../../../../shared/projectScriptProperties'
import type {
  EditingSceneNodeState,
  SceneHierarchyClipboardOperation,
  SceneHierarchyClipboardState
} from './sceneHierarchyModel'
import {
  buildDefaultSceneNode,
  buildUniqueSceneNodeName,
  canInsertSceneNodeAtParent,
  clampSceneActorPosition,
  clampSceneCollisionRect,
  clearFollowCameraInSceneNodeSubtree,
  cloneSceneNodeSnapshot,
  cloneSceneNodeWithFreshIds,
  createSceneNodeId,
  findSceneNodeById,
  findSceneNodeRecord,
  getDefaultSceneNodeName,
  getSceneChildNodes,
  insertSceneNode,
  isSceneActorNode,
  isSceneCollisionNode,
  mapSceneNodes,
  mergeScriptPropertyValue,
  removeSceneNodeById,
  sceneSubtreeContainsNodeId,
  translateSceneNodeSubtreeSpatial,
  updateSceneNodeById
} from './sceneHierarchyModel'

export interface SceneMapSize {
  width: number
  height: number
}

interface SceneNodeChange {
  nodes: SceneAssetNode[]
  selectedNodeId: string | null
}

interface SceneClipboardChange extends SceneNodeChange {
  clipboard: SceneHierarchyClipboardState | null
}

export interface SceneNodeCreationChange extends SceneNodeChange {
  editingNode: EditingSceneNodeState
}

const buildEditingState = (nodeId: string, nodeName: string): EditingSceneNodeState => {
  return {
    nodeId,
    draftName: nodeName,
    originalName: nodeName
  }
}

export const clampSceneNodesToMap = (
  nodes: SceneAssetNode[],
  mapSize: SceneMapSize
): SceneAssetNode[] => {
  const clampNodeList = (
    currentNodes: SceneAssetNode[],
    directParentActor: SceneAssetActorNode | null = null
  ): SceneAssetNode[] => {
    return currentNodes.map((node) => {
      if (isSceneActorNode(node)) {
        const clampedPosition = clampSceneActorPosition(node.x, node.y, mapSize)
        const nextNode =
          clampedPosition.x === node.x && clampedPosition.y === node.y
            ? node
            : {
                ...node,
                x: clampedPosition.x,
                y: clampedPosition.y
              }

        if (nextNode.children.length === 0) {
          return nextNode
        }

        const nextChildren = clampNodeList(nextNode.children, nextNode)
        const childrenChanged = nextChildren.some(
          (childNode, index) => childNode !== nextNode.children[index]
        )

        return childrenChanged ? { ...nextNode, children: nextChildren } : nextNode
      }

      if (isSceneCollisionNode(node)) {
        const absoluteX = node.x + (directParentActor?.x ?? 0)
        const absoluteY = node.y + (directParentActor?.y ?? 0)
        const clampedRect = clampSceneCollisionRect(
          absoluteX,
          absoluteY,
          node.width,
          node.height,
          mapSize
        )
        const nextX = clampedRect.x - (directParentActor?.x ?? 0)
        const nextY = clampedRect.y - (directParentActor?.y ?? 0)

        if (
          nextX === node.x &&
          nextY === node.y &&
          clampedRect.width === node.width &&
          clampedRect.height === node.height
        ) {
          return node
        }

        return {
          ...node,
          x: nextX,
          y: nextY,
          width: clampedRect.width,
          height: clampedRect.height
        }
      }

      if (node.children.length === 0) {
        return node
      }

      const nextChildren = clampNodeList(node.children, null)
      const childrenChanged = nextChildren.some(
        (childNode, index) => childNode !== node.children[index]
      )

      return childrenChanged ? { ...node, children: nextChildren } : node
    })
  }

  return clampNodeList(nodes)
}

export const buildSceneNodeCreationChange = (
  nodes: SceneAssetNode[],
  type: SceneAssetNode['type'],
  parentId: string | null
): SceneNodeCreationChange => {
  const nodeName = buildUniqueSceneNodeName(
    getSceneChildNodes(nodes, parentId),
    getDefaultSceneNodeName(type)
  )
  const nextNode = buildDefaultSceneNode(type, nodeName, createSceneNodeId)

  return {
    nodes: insertSceneNode(nodes, parentId, nextNode),
    selectedNodeId: nextNode.id,
    editingNode: buildEditingState(nextNode.id, nextNode.name)
  }
}

export const buildSceneNodeDeletionChange = (
  nodes: SceneAssetNode[],
  clipboard: SceneHierarchyClipboardState | null,
  nodeId: string
): SceneClipboardChange | null => {
  const removal = removeSceneNodeById(nodes, nodeId)

  if (!removal) {
    return null
  }

  const nextClipboard =
    clipboard?.operation === 'cut' &&
    clipboard.sourceNodeId &&
    sceneSubtreeContainsNodeId(removal.removedNode, clipboard.sourceNodeId)
      ? null
      : clipboard

  return {
    nodes: removal.nodes,
    selectedNodeId: removal.parentId,
    clipboard: nextClipboard
  }
}

export const buildSceneClipboardChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  operation: SceneHierarchyClipboardOperation
): SceneClipboardChange | null => {
  const node = findSceneNodeById(nodes, nodeId)

  if (!node) {
    return null
  }

  const stagedNode =
    operation === 'copy'
      ? clearFollowCameraInSceneNodeSubtree(cloneSceneNodeSnapshot(node))
      : cloneSceneNodeSnapshot(node)

  return {
    nodes,
    selectedNodeId: nodeId,
    clipboard: {
      operation,
      node: stagedNode,
      sourceNodeId: operation === 'cut' ? nodeId : null
    }
  }
}

export const buildScenePasteChange = (
  nodes: SceneAssetNode[],
  clipboard: SceneHierarchyClipboardState,
  targetParentId: string | null
): SceneClipboardChange | null => {
  if (clipboard.operation === 'copy') {
    const pastedNode = cloneSceneNodeWithFreshIds(clipboard.node, createSceneNodeId)
    pastedNode.name = buildUniqueSceneNodeName(
      getSceneChildNodes(nodes, targetParentId),
      clipboard.node.name
    )

    return {
      nodes: insertSceneNode(nodes, targetParentId, pastedNode),
      selectedNodeId: pastedNode.id,
      clipboard
    }
  }

  if (!clipboard.sourceNodeId) {
    return null
  }

  const removal = removeSceneNodeById(nodes, clipboard.sourceNodeId)

  if (!removal || !canInsertSceneNodeAtParent(removal.nodes, targetParentId, removal.removedNode)) {
    return null
  }

  return {
    nodes: insertSceneNode(removal.nodes, targetParentId, removal.removedNode),
    selectedNodeId: removal.removedNode.id,
    clipboard: null
  }
}

export const buildSceneRenameChange = (
  nodes: SceneAssetNode[],
  editingNode: EditingSceneNodeState
): SceneNodeChange | null => {
  const trimmedName = editingNode.draftName.trim()

  if (trimmedName.length === 0 || trimmedName === editingNode.originalName) {
    return null
  }

  const nodeRecord = findSceneNodeRecord(nodes, editingNode.nodeId)

  if (!nodeRecord) {
    return null
  }

  const siblingNodes = getSceneChildNodes(nodes, nodeRecord.parentId)
  const nextName = buildUniqueSceneNodeName(siblingNodes, trimmedName, editingNode.nodeId)

  return {
    nodes: updateSceneNodeById(nodes, editingNode.nodeId, (node) => ({
      ...node,
      name: nextName
    })),
    selectedNodeId: nodeRecord.node.id
  }
}

export const buildActorUpdateChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  nextValues: Partial<Pick<SceneAssetActorNode, 'x' | 'y' | 'spritePath' | 'scriptPath'>>
): SceneNodeChange | null => {
  const actor = findSceneNodeById(nodes, nodeId)

  if (!actor || !isSceneActorNode(actor)) {
    return null
  }

  const nextActor: SceneAssetActorNode = {
    ...actor,
    ...nextValues
  }

  if (
    nextActor.x === actor.x &&
    nextActor.y === actor.y &&
    nextActor.spritePath === actor.spritePath &&
    nextActor.scriptPath === actor.scriptPath
  ) {
    return null
  }

  const deltaX = nextActor.x - actor.x
  const deltaY = nextActor.y - actor.y

  return {
    nodes: updateSceneNodeById(nodes, nodeId, (node) => {
      if (!isSceneActorNode(node)) {
        return node
      }

      if (deltaX === 0 && deltaY === 0) {
        return nextActor
      }

      const translatedNode = translateSceneNodeSubtreeSpatial(node, deltaX, deltaY)

      return {
        ...(translatedNode as SceneAssetActorNode),
        spritePath: nextActor.spritePath,
        scriptPath: nextActor.scriptPath,
        followCamera: nextActor.followCamera
      }
    }),
    selectedNodeId: nodeId
  }
}

export const buildSceneScriptPropertyChange = (
  scriptProperties: ScriptPropertyMap | undefined,
  propertyName: string,
  propertyValue: ScriptPropertyValue
): ScriptPropertyMap | undefined | null => {
  if (scriptProperties?.[propertyName] === propertyValue) {
    return null
  }

  return mergeScriptPropertyValue(scriptProperties, propertyName, propertyValue)
}

export const buildFollowedActorChange = (
  nodes: SceneAssetNode[],
  nodeId: string | null,
  selectedNodeId: string | null
): SceneNodeChange | null => {
  if (nodeId) {
    const actor = findSceneNodeById(nodes, nodeId)

    if (!actor || !isSceneActorNode(actor)) {
      return null
    }
  }

  let didChange = false
  const nextNodes = mapSceneNodes(nodes, (node) => {
    if (!isSceneActorNode(node)) {
      return node
    }

    const nextFollowCamera = nodeId !== null && node.id === nodeId

    if (node.followCamera === nextFollowCamera) {
      return node
    }

    didChange = true
    return {
      ...node,
      followCamera: nextFollowCamera
    }
  })

  if (!didChange) {
    return null
  }

  return {
    nodes: nextNodes,
    selectedNodeId: nodeId ?? selectedNodeId
  }
}

export const buildActorResourcePathChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  resourcePath: string | null
): SceneAssetNode[] | null => {
  const actor = findSceneNodeById(nodes, nodeId)

  if (!actor || !isSceneActorNode(actor)) {
    return null
  }

  const nextResourcePath = resourcePath ?? undefined

  if ((actor.resourcePath ?? undefined) === nextResourcePath) {
    return null
  }

  return updateSceneNodeById(nodes, nodeId, (node) =>
    isSceneActorNode(node)
      ? {
          ...node,
          resourcePath: nextResourcePath
        }
      : node
  )
}

export const buildActorScriptPropertyChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  propertyName: string,
  propertyValue: ScriptPropertyValue
): SceneNodeChange | null => {
  const actor = findSceneNodeById(nodes, nodeId)

  if (
    !actor ||
    !isSceneActorNode(actor) ||
    actor.scriptProperties?.[propertyName] === propertyValue
  ) {
    return null
  }

  return {
    nodes: updateSceneNodeById(nodes, nodeId, (node) =>
      isSceneActorNode(node)
        ? {
            ...node,
            scriptProperties: mergeScriptPropertyValue(
              node.scriptProperties,
              propertyName,
              propertyValue
            )
          }
        : node
    ),
    selectedNodeId: nodeId
  }
}

export const buildCollisionUpdateChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  nextValues: Partial<Pick<SceneAssetCollisionNode, 'x' | 'y' | 'width' | 'height' | 'isBlocking'>>
): SceneNodeChange | null => {
  const collision = findSceneNodeById(nodes, nodeId)
  const collisionRecord = findSceneNodeRecord(nodes, nodeId)

  if (!collision || !isSceneCollisionNode(collision) || !collisionRecord) {
    return null
  }

  const parentNode = collisionRecord.parentId
    ? findSceneNodeById(nodes, collisionRecord.parentId)
    : null
  const parentActor = parentNode && isSceneActorNode(parentNode) ? parentNode : null
  const nextCollision: SceneAssetCollisionNode = {
    ...collision,
    ...nextValues,
    ...(nextValues.x !== undefined ? { x: nextValues.x - (parentActor?.x ?? 0) } : {}),
    ...(nextValues.y !== undefined ? { y: nextValues.y - (parentActor?.y ?? 0) } : {})
  }

  if (
    nextCollision.x === collision.x &&
    nextCollision.y === collision.y &&
    nextCollision.width === collision.width &&
    nextCollision.height === collision.height &&
    nextCollision.isBlocking === collision.isBlocking
  ) {
    return null
  }

  return {
    nodes: updateSceneNodeById(nodes, nodeId, (node) =>
      isSceneCollisionNode(node) ? nextCollision : node
    ),
    selectedNodeId: nodeId
  }
}

export const buildCollisionCallbacksChange = (
  nodes: SceneAssetNode[],
  nodeId: string,
  callbacks: SceneAssetCollisionCallback[]
): SceneNodeChange | null => {
  const collision = findSceneNodeById(nodes, nodeId)

  if (!collision || !isSceneCollisionNode(collision)) {
    return null
  }

  const nextCallbacks = callbacks.map((callback) => ({ ...callback }))
  const didChange =
    nextCallbacks.length !== collision.callbacks.length ||
    nextCallbacks.some((callback, index) => {
      const currentCallback = collision.callbacks[index]
      return (
        !currentCallback ||
        currentCallback.scriptPath !== callback.scriptPath ||
        currentCallback.functionName !== callback.functionName
      )
    })

  if (!didChange) {
    return null
  }

  return {
    nodes: updateSceneNodeById(nodes, nodeId, (node) =>
      isSceneCollisionNode(node)
        ? {
            ...node,
            callbacks: nextCallbacks
          }
        : node
    ),
    selectedNodeId: nodeId
  }
}

export const buildTilemapPathChange = (
  nodes: SceneAssetNode[],
  nextTilemapSize?: SceneMapSize
): SceneAssetNode[] => {
  return nextTilemapSize ? clampSceneNodesToMap(nodes, nextTilemapSize) : nodes
}

export const buildLoadedActorChange = (
  nodes: SceneAssetNode[],
  parentId: string | null,
  actorRoot: SceneAssetActorNode,
  placement?: { x: number; y: number },
  resourcePath?: string | null
): SceneNodeChange => {
  let nextActorNode = clearFollowCameraInSceneNodeSubtree(
    cloneSceneNodeWithFreshIds(actorRoot, createSceneNodeId)
  ) as SceneAssetActorNode

  if (placement) {
    nextActorNode = translateSceneNodeSubtreeSpatial(
      nextActorNode,
      placement.x - nextActorNode.x,
      placement.y - nextActorNode.y
    ) as SceneAssetActorNode
  }

  nextActorNode.name = buildUniqueSceneNodeName(getSceneChildNodes(nodes, parentId), actorRoot.name)
  nextActorNode.resourcePath = resourcePath ?? undefined

  if (!canInsertSceneNodeAtParent(nodes, parentId, nextActorNode)) {
    throw new Error('That actor cannot be inserted at the selected location.')
  }

  return {
    nodes: insertSceneNode(nodes, parentId, nextActorNode),
    selectedNodeId: nextActorNode.id
  }
}

export const snapshotSceneActor = (
  nodes: SceneAssetNode[],
  nodeId: string
): SceneAssetActorNode | null => {
  const node = findSceneNodeById(nodes, nodeId)

  if (!node || !isSceneActorNode(node)) {
    return null
  }

  return cloneSceneNodeSnapshot(node) as SceneAssetActorNode
}
