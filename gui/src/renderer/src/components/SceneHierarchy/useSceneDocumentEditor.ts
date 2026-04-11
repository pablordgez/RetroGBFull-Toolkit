import { useCallback, useMemo, useState } from 'react'
import { useHistory } from '../hooks/history/useHistory'
import type {
  SceneAssetActorNode,
  SceneAssetCollisionCallback,
  SceneAssetCollisionNode,
  SceneAssetDocument,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import {
  type EditingSceneNodeState,
  type SceneEditorDocumentSnapshot,
  type SceneHierarchyClipboardOperation,
  type SceneHierarchyClipboardState,
  type SceneHierarchyHistoryState,
  buildDefaultSceneNode,
  buildUniqueSceneNodeName,
  canCreateSceneNodeType,
  canInsertSceneNodeAtParent,
  clampSceneActorPosition,
  clampSceneCollisionRect,
  clearFollowCameraInSceneNodeSubtree,
  cloneSceneDocumentSnapshot,
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
  isValidScenePasteTarget,
  mapSceneNodes,
  removeSceneNodeById,
  sceneSubtreeContainsNodeId,
  translateSceneNodeSubtreeSpatial,
  updateSceneNodeById
} from './sceneHierarchyModel'

interface UseSceneDocumentEditorOptions {
  scene: SceneAssetDocument | null
  onSceneChange: (document: SceneAssetDocument) => void
}

interface SceneMapSize {
  width: number
  height: number
}

export interface SceneDocumentEditor {
  canEdit: boolean
  canUndo: boolean
  canRedo: boolean
  nodes: SceneAssetNode[]
  scriptPath: string | null
  tilemapPath: string | null
  windowPath: string | null
  selectedNodeId: string | null
  selectedNode: SceneAssetNode | null
  selectedActor: SceneAssetActorNode | null
  selectedCollision: SceneAssetCollisionNode | null
  editingNode: EditingSceneNodeState | null
  clipboard: SceneHierarchyClipboardState | null
  undo: () => Promise<void>
  redo: () => Promise<void>
  selectNode: (nodeId: string | null) => void
  beginEditingNode: (nodeId: string) => void
  setEditingNodeDraftName: (nextName: string) => void
  cancelEditingNode: () => void
  commitRename: () => void
  canCreateNode: (type: SceneAssetNode['type'], parentId: string | null) => boolean
  createNode: (type: SceneAssetNode['type'], parentId: string | null) => void
  deleteNode: (nodeId: string) => void
  toggleCollapsed: (nodeId: string) => void
  stageClipboard: (nodeId: string, operation: SceneHierarchyClipboardOperation) => void
  canPasteTo: (targetParentId: string | null) => boolean
  pasteNodes: (targetParentId: string | null) => void
  updateActor: (
    nodeId: string,
    nextValues: Partial<Pick<SceneAssetActorNode, 'x' | 'y' | 'spritePath' | 'scriptPath'>>
  ) => void
  setSceneScriptPath: (nextScriptPath: string | null) => void
  setActorResourcePath: (nodeId: string, resourcePath: string | null) => void
  setFollowedActor: (nodeId: string | null) => void
  updateCollision: (
    nodeId: string,
    nextValues: Partial<
      Pick<SceneAssetCollisionNode, 'x' | 'y' | 'width' | 'height' | 'isBlocking'>
    >
  ) => void
  setCollisionCallbacks: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
  clampActorsToMap: (mapSize: SceneMapSize | null) => void
  setTilemapPath: (nextTilemapPath: string | null, nextTilemapSize?: SceneMapSize) => void
  setWindowPath: (nextWindowPath: string | null) => void
  loadActor: (
    parentId: string | null,
    actorRoot: SceneAssetActorNode,
    placement?: { x: number; y: number },
    resourcePath?: string | null
  ) => void
  snapshotActor: (nodeId: string) => SceneAssetActorNode | null
}

export const useSceneDocumentEditor = ({
  scene,
  onSceneChange
}: UseSceneDocumentEditorOptions): SceneDocumentEditor => {
  const initialSceneSnapshot = cloneSceneDocumentSnapshot(
    scene ?? {
      scriptPath: null,
      tilemapPath: null,
      windowPath: null,
      nodes: []
    }
  )
  const [documentSnapshot, setDocumentSnapshot] =
    useState<SceneEditorDocumentSnapshot>(initialSceneSnapshot)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<SceneHierarchyClipboardState | null>(null)
  const [editingNode, setEditingNode] = useState<EditingSceneNodeState | null>(null)
  const { record, undo, redo, canUndo, canRedo } = useHistory()

  const canEdit = Boolean(scene)

  const publishDocumentSnapshot = useCallback(
    (nextSnapshot: SceneEditorDocumentSnapshot) => {
      const clonedSnapshot = cloneSceneDocumentSnapshot(nextSnapshot)
      setDocumentSnapshot(clonedSnapshot)

      if (!scene) {
        return
      }

      onSceneChange({
        ...scene,
        scriptPath: clonedSnapshot.scriptPath,
        tilemapPath: clonedSnapshot.tilemapPath,
        windowPath: clonedSnapshot.windowPath,
        nodes: clonedSnapshot.nodes
      })
    },
    [onSceneChange, scene]
  )

  const applyHistoryState = useCallback(
    (nextState: SceneHierarchyHistoryState) => {
      publishDocumentSnapshot({
        scriptPath: nextState.scriptPath,
        tilemapPath: nextState.tilemapPath,
        windowPath: nextState.windowPath,
        nodes: nextState.nodes
      })
      setSelectedNodeId(nextState.selectedNodeId)
      setClipboard(nextState.clipboard)
      setEditingNode(null)
    },
    [publishDocumentSnapshot]
  )

  const captureHistoryState = useCallback(
    (nextValues?: Partial<SceneHierarchyHistoryState>): SceneHierarchyHistoryState => {
      return {
        scriptPath:
          nextValues && 'scriptPath' in nextValues
            ? (nextValues.scriptPath ?? null)
            : documentSnapshot.scriptPath,
        tilemapPath:
          nextValues && 'tilemapPath' in nextValues
            ? (nextValues.tilemapPath ?? null)
            : documentSnapshot.tilemapPath,
        windowPath:
          nextValues && 'windowPath' in nextValues
            ? (nextValues.windowPath ?? null)
            : documentSnapshot.windowPath,
        nodes: nextValues?.nodes ?? documentSnapshot.nodes,
        selectedNodeId:
          nextValues && 'selectedNodeId' in nextValues
            ? (nextValues.selectedNodeId ?? null)
            : selectedNodeId,
        clipboard:
          nextValues && 'clipboard' in nextValues ? (nextValues.clipboard ?? null) : clipboard
      }
    },
    [
      clipboard,
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.tilemapPath,
      documentSnapshot.windowPath,
      selectedNodeId
    ]
  )

  const recordHistoryTransition = useCallback(
    (previousState: SceneHierarchyHistoryState, nextState: SceneHierarchyHistoryState) => {
      record({
        undo: () => {
          applyHistoryState(previousState)
        },
        redo: () => {
          applyHistoryState(nextState)
        }
      })
    },
    [applyHistoryState, record]
  )

  const clampNodesToMap = useCallback(
    (nodes: SceneAssetNode[], mapSize: SceneMapSize): SceneAssetNode[] => {
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
    },
    []
  )

  const selectedNode = useMemo(() => {
    return selectedNodeId ? findSceneNodeById(documentSnapshot.nodes, selectedNodeId) : null
  }, [documentSnapshot.nodes, selectedNodeId])

  const selectedActor = useMemo(() => {
    return selectedNode && isSceneActorNode(selectedNode) ? selectedNode : null
  }, [selectedNode])

  const selectedCollision = useMemo(() => {
    return selectedNode && isSceneCollisionNode(selectedNode) ? selectedNode : null
  }, [selectedNode])

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
  }, [])

  const beginEditingNode = useCallback(
    (nodeId: string) => {
      const node = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!node || !canEdit) {
        return
      }

      setSelectedNodeId(nodeId)
      setEditingNode({
        nodeId,
        draftName: node.name,
        originalName: node.name
      })
    },
    [canEdit, documentSnapshot.nodes]
  )

  const setEditingNodeDraftName = useCallback((nextName: string) => {
    setEditingNode((currentEditingNode) => {
      if (!currentEditingNode) {
        return currentEditingNode
      }

      return {
        ...currentEditingNode,
        draftName: nextName
      }
    })
  }, [])

  const cancelEditingNode = useCallback(() => {
    setEditingNode(null)
  }, [])

  const canCreateNode = useCallback(
    (type: SceneAssetNode['type'], parentId: string | null) => {
      return (
        canEdit && !editingNode && canCreateSceneNodeType(documentSnapshot.nodes, parentId, type)
      )
    },
    [canEdit, documentSnapshot.nodes, editingNode]
  )

  const createNode = useCallback(
    (type: SceneAssetNode['type'], parentId: string | null) => {
      if (!scene || editingNode || !canCreateNode(type, parentId)) {
        return
      }

      const nodeName = buildUniqueSceneNodeName(
        getSceneChildNodes(documentSnapshot.nodes, parentId),
        getDefaultSceneNodeName(type)
      )
      const nextNode = buildDefaultSceneNode(type, nodeName, createSceneNodeId)
      const nextNodes = insertSceneNode(documentSnapshot.nodes, parentId, nextNode)
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: nextNode.id
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)

      setEditingNode({
        nodeId: nextNode.id,
        draftName: nextNode.name,
        originalName: nextNode.name
      })
    },
    [
      applyHistoryState,
      canCreateNode,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (!scene || editingNode) {
        return
      }

      const removal = removeSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!removal) {
        return
      }

      const nextClipboard =
        clipboard?.operation === 'cut' &&
        clipboard.sourceNodeId &&
        sceneSubtreeContainsNodeId(removal.removedNode, clipboard.sourceNodeId)
          ? null
          : clipboard
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: removal.nodes,
        selectedNodeId: removal.parentId,
        clipboard: nextClipboard
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      clipboard,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const toggleCollapsed = useCallback(
    (nodeId: string) => {
      if (!scene) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        tilemapPath: documentSnapshot.tilemapPath,
        windowPath: documentSnapshot.windowPath,
        nodes: updateSceneNodeById(documentSnapshot.nodes, nodeId, (node) => ({
          ...node,
          isCollapsed: !node.isCollapsed
        }))
      })
    },
    [
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.tilemapPath,
      documentSnapshot.windowPath,
      publishDocumentSnapshot,
      scene
    ]
  )

  const stageClipboard = useCallback(
    (nodeId: string, operation: SceneHierarchyClipboardOperation) => {
      if (!scene || editingNode) {
        return
      }

      const node = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!node) {
        return
      }

      const stagedNode =
        operation === 'copy'
          ? clearFollowCameraInSceneNodeSubtree(cloneSceneNodeSnapshot(node))
          : cloneSceneNodeSnapshot(node)
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        selectedNodeId: nodeId,
        clipboard: {
          operation,
          node: stagedNode,
          sourceNodeId: operation === 'cut' ? nodeId : null
        }
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const canPasteTo = useCallback(
    (targetParentId: string | null) => {
      return canEdit && isValidScenePasteTarget(documentSnapshot.nodes, clipboard, targetParentId)
    },
    [canEdit, clipboard, documentSnapshot.nodes]
  )

  const pasteNodes = useCallback(
    (targetParentId: string | null) => {
      if (!scene || editingNode || !clipboard || !canPasteTo(targetParentId)) {
        return
      }

      const previousState = captureHistoryState()

      if (clipboard.operation === 'copy') {
        const pastedNode = cloneSceneNodeWithFreshIds(clipboard.node, createSceneNodeId)
        pastedNode.name = buildUniqueSceneNodeName(
          getSceneChildNodes(documentSnapshot.nodes, targetParentId),
          clipboard.node.name
        )

        const nextNodes = insertSceneNode(documentSnapshot.nodes, targetParentId, pastedNode)
        const nextState = captureHistoryState({
          nodes: nextNodes,
          selectedNodeId: pastedNode.id
        })

        applyHistoryState(nextState)
        recordHistoryTransition(previousState, nextState)
        return
      }

      if (!clipboard.sourceNodeId) {
        return
      }

      const removal = removeSceneNodeById(documentSnapshot.nodes, clipboard.sourceNodeId)

      if (
        !removal ||
        !canInsertSceneNodeAtParent(removal.nodes, targetParentId, removal.removedNode)
      ) {
        return
      }

      const nextNodes = insertSceneNode(removal.nodes, targetParentId, removal.removedNode)
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: removal.removedNode.id,
        clipboard: null
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      canPasteTo,
      captureHistoryState,
      clipboard,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const commitRename = useCallback(() => {
    if (!scene || !editingNode) {
      return
    }

    const trimmedName = editingNode.draftName.trim()

    if (trimmedName.length === 0 || trimmedName === editingNode.originalName) {
      setEditingNode(null)
      return
    }

    const nodeRecord = findSceneNodeRecord(documentSnapshot.nodes, editingNode.nodeId)

    if (!nodeRecord) {
      setEditingNode(null)
      return
    }

    const siblingNodes = getSceneChildNodes(documentSnapshot.nodes, nodeRecord.parentId)
    const nextName = buildUniqueSceneNodeName(siblingNodes, trimmedName, editingNode.nodeId)
    const nextNodes = updateSceneNodeById(documentSnapshot.nodes, editingNode.nodeId, (node) => ({
      ...node,
      name: nextName
    }))
    const previousState = captureHistoryState()
    const nextState = captureHistoryState({ nodes: nextNodes })

    applyHistoryState(nextState)
    recordHistoryTransition(previousState, nextState)
  }, [
    applyHistoryState,
    captureHistoryState,
    documentSnapshot.nodes,
    editingNode,
    recordHistoryTransition,
    scene
  ])

  const updateActor = useCallback(
    (
      nodeId: string,
      nextValues: Partial<Pick<SceneAssetActorNode, 'x' | 'y' | 'spritePath' | 'scriptPath'>>
    ) => {
      if (!scene || editingNode) {
        return
      }

      const actor = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!actor || !isSceneActorNode(actor)) {
        return
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
        return
      }

      const deltaX = nextActor.x - actor.x
      const deltaY = nextActor.y - actor.y
      const nextNodes = updateSceneNodeById(documentSnapshot.nodes, nodeId, (node) => {
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
      })
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({ nodes: nextNodes, selectedNodeId: nodeId })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const setSceneScriptPath = useCallback(
    (nextScriptPath: string | null) => {
      if (!scene || editingNode || nextScriptPath === documentSnapshot.scriptPath) {
        return
      }

      const previousState = captureHistoryState()
      const nextState = captureHistoryState({ scriptPath: nextScriptPath })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.scriptPath,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const setFollowedActor = useCallback(
    (nodeId: string | null) => {
      if (!scene || editingNode) {
        return
      }

      if (nodeId) {
        const actor = findSceneNodeById(documentSnapshot.nodes, nodeId)

        if (!actor || !isSceneActorNode(actor)) {
          return
        }
      }

      let didChange = false
      const nextNodes = mapSceneNodes(documentSnapshot.nodes, (node) => {
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
        return
      }

      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: nodeId ?? selectedNodeId
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene,
      selectedNodeId
    ]
  )

  const setActorResourcePath = useCallback(
    (nodeId: string, resourcePath: string | null) => {
      if (!scene) {
        return
      }

      const actor = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!actor || !isSceneActorNode(actor)) {
        return
      }

      const nextResourcePath = resourcePath ?? undefined

      if ((actor.resourcePath ?? undefined) === nextResourcePath) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        tilemapPath: documentSnapshot.tilemapPath,
        windowPath: documentSnapshot.windowPath,
        nodes: updateSceneNodeById(documentSnapshot.nodes, nodeId, (node) =>
          isSceneActorNode(node)
            ? {
                ...node,
                resourcePath: nextResourcePath
              }
            : node
        )
      })
    },
    [
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.tilemapPath,
      documentSnapshot.windowPath,
      publishDocumentSnapshot,
      scene
    ]
  )

  const updateCollision = useCallback(
    (
      nodeId: string,
      nextValues: Partial<
        Pick<SceneAssetCollisionNode, 'x' | 'y' | 'width' | 'height' | 'isBlocking'>
      >
    ) => {
      if (!scene || editingNode) {
        return
      }

      const collision = findSceneNodeById(documentSnapshot.nodes, nodeId)
      const collisionRecord = findSceneNodeRecord(documentSnapshot.nodes, nodeId)

      if (!collision || !isSceneCollisionNode(collision) || !collisionRecord) {
        return
      }

      const parentNode = collisionRecord.parentId
        ? findSceneNodeById(documentSnapshot.nodes, collisionRecord.parentId)
        : null
      const parentActor = parentNode && isSceneActorNode(parentNode) ? parentNode : null

      const nextCollision: SceneAssetCollisionNode = {
        ...collision,
        ...nextValues,
        ...(nextValues.x !== undefined
          ? { x: nextValues.x - (parentActor?.x ?? 0) }
          : {}),
        ...(nextValues.y !== undefined
          ? { y: nextValues.y - (parentActor?.y ?? 0) }
          : {})
      }

      if (
        nextCollision.x === collision.x &&
        nextCollision.y === collision.y &&
        nextCollision.width === collision.width &&
        nextCollision.height === collision.height &&
        nextCollision.isBlocking === collision.isBlocking
      ) {
        return
      }

      const nextNodes = updateSceneNodeById(documentSnapshot.nodes, nodeId, (node) => {
        return isSceneCollisionNode(node) ? nextCollision : node
      })
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({ nodes: nextNodes, selectedNodeId: nodeId })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const setCollisionCallbacks = useCallback(
    (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => {
      if (!scene || editingNode) {
        return
      }

      const collision = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!collision || !isSceneCollisionNode(collision)) {
        return
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
        return
      }

      const nextNodes = updateSceneNodeById(documentSnapshot.nodes, nodeId, (node) =>
        isSceneCollisionNode(node)
          ? {
              ...node,
              callbacks: nextCallbacks
            }
          : node
      )
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({ nodes: nextNodes, selectedNodeId: nodeId })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const clampActorsToMap = useCallback(
    (mapSize: SceneMapSize | null) => {
      if (!scene || !mapSize) {
        return
      }

      const clampedNodes = clampNodesToMap(documentSnapshot.nodes, mapSize)
      const hasChanges = clampedNodes.some((node, index) => node !== documentSnapshot.nodes[index])

      if (!hasChanges) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        tilemapPath: documentSnapshot.tilemapPath,
        windowPath: documentSnapshot.windowPath,
        nodes: clampedNodes
      })
    },
    [
      clampNodesToMap,
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.tilemapPath,
      documentSnapshot.windowPath,
      publishDocumentSnapshot,
      scene
    ]
  )

  const setTilemapPath = useCallback(
    (nextTilemapPath: string | null, nextTilemapSize?: SceneMapSize) => {
      if (!scene || editingNode || nextTilemapPath === documentSnapshot.tilemapPath) {
        return
      }

      const previousState = captureHistoryState()
      const nextNodes =
        nextTilemapSize !== undefined
          ? clampNodesToMap(documentSnapshot.nodes, nextTilemapSize)
          : documentSnapshot.nodes
      const nextState = captureHistoryState({
        tilemapPath: nextTilemapPath,
        nodes: nextNodes
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      clampNodesToMap,
      captureHistoryState,
      documentSnapshot.nodes,
      documentSnapshot.tilemapPath,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const setWindowPath = useCallback(
    (nextWindowPath: string | null) => {
      if (!scene || editingNode || nextWindowPath === documentSnapshot.windowPath) {
        return
      }

      const previousState = captureHistoryState()
      const nextState = captureHistoryState({ windowPath: nextWindowPath })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.windowPath,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const loadActor = useCallback(
    (
      parentId: string | null,
      actorRoot: SceneAssetActorNode,
      placement?: { x: number; y: number },
      resourcePath?: string | null
    ) => {
      if (!scene || editingNode) {
        return
      }

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

      nextActorNode.name = buildUniqueSceneNodeName(
        getSceneChildNodes(documentSnapshot.nodes, parentId),
        actorRoot.name
      )
      nextActorNode.resourcePath = resourcePath ?? undefined

      if (!canInsertSceneNodeAtParent(documentSnapshot.nodes, parentId, nextActorNode)) {
        throw new Error('That actor cannot be inserted at the selected location.')
      }

      const nextNodes = insertSceneNode(documentSnapshot.nodes, parentId, nextActorNode)
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: nextActorNode.id
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      documentSnapshot.nodes,
      editingNode,
      recordHistoryTransition,
      scene
    ]
  )

  const snapshotActor = useCallback(
    (nodeId: string) => {
      const node = findSceneNodeById(documentSnapshot.nodes, nodeId)

      if (!node || !isSceneActorNode(node)) {
        return null
      }

      return cloneSceneNodeSnapshot(node) as SceneAssetActorNode
    },
    [documentSnapshot.nodes]
  )

  return {
    canEdit,
    canUndo,
    canRedo,
    nodes: documentSnapshot.nodes,
    scriptPath: documentSnapshot.scriptPath,
    tilemapPath: documentSnapshot.tilemapPath,
    windowPath: documentSnapshot.windowPath,
    selectedNodeId,
    selectedNode,
    selectedActor,
    selectedCollision,
    editingNode,
    clipboard,
    undo,
    redo,
    selectNode,
    beginEditingNode,
    setEditingNodeDraftName,
    cancelEditingNode,
    commitRename,
    canCreateNode,
    createNode,
    deleteNode,
    toggleCollapsed,
    stageClipboard,
    canPasteTo,
    pasteNodes,
    updateActor,
    setSceneScriptPath,
    setActorResourcePath,
    setFollowedActor,
    updateCollision,
    setCollisionCallbacks,
    clampActorsToMap,
    setTilemapPath,
    setWindowPath,
    loadActor,
    snapshotActor
  }
}
