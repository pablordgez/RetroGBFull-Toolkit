import { useCallback, useMemo, useState } from 'react'
import { useHistory } from '../hooks/history/useHistory'
import type {
  SceneAssetActorNode,
  SceneAssetCollisionCallback,
  SceneAssetCollisionNode,
  SceneAssetDocument,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import type { ScriptPropertyValue } from '../../../../shared/projectScriptProperties'
import {
  type EditingSceneNodeState,
  type SceneEditorDocumentSnapshot,
  type SceneHierarchyClipboardOperation,
  type SceneHierarchyClipboardState,
  type SceneHierarchyHistoryState,
  canCreateSceneNodeType,
  cloneSceneDocumentSnapshot,
  findSceneNodeById,
  isSceneActorNode,
  isSceneCollisionNode,
  isValidScenePasteTarget,
  updateSceneNodeById
} from './sceneHierarchyModel'
import {
  type SceneMapSize,
  buildActorResourcePathChange,
  buildActorScriptPropertyChange,
  buildActorUpdateChange,
  buildCollisionCallbacksChange,
  buildCollisionUpdateChange,
  buildFollowedActorChange,
  buildLoadedActorChange,
  buildSceneClipboardChange,
  buildSceneNodeCreationChange,
  buildSceneNodeDeletionChange,
  buildSceneNodeTagsChange,
  buildScenePasteChange,
  buildSceneRenameChange,
  buildSceneScriptPropertyChange,
  buildTilemapPathChange,
  clampSceneNodesToMap,
  snapshotSceneActor
} from './sceneDocumentEditorCommands'

interface UseSceneDocumentEditorOptions {
  scene: SceneAssetDocument | null
  onSceneChange: (document: SceneAssetDocument) => void
}

export interface SceneDocumentEditor {
  canEdit: boolean
  canUndo: boolean
  canRedo: boolean
  nodes: SceneAssetNode[]
  scriptPath: string | null
  sceneScriptProperties: SceneAssetDocument['scriptProperties']
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
  setSceneScriptProperty: (propertyName: string, propertyValue: ScriptPropertyValue) => void
  setActorScriptProperty: (
    nodeId: string,
    propertyName: string,
    propertyValue: ScriptPropertyValue
  ) => void
  setSceneScriptPath: (nextScriptPath: string | null) => void
  setActorResourcePath: (nodeId: string, resourcePath: string | null) => void
  setFollowedActor: (nodeId: string | null) => void
  setNodeTags: (nodeId: string, tags: string[]) => void
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
      scriptProperties: undefined,
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
        scriptProperties: clonedSnapshot.scriptProperties,
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
        scriptProperties: nextState.scriptProperties,
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
        scriptProperties:
          nextValues && 'scriptProperties' in nextValues
            ? nextValues.scriptProperties
            : documentSnapshot.scriptProperties,
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
      documentSnapshot.scriptProperties,
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

  const commitHistoryValues = useCallback(
    (nextValues: Partial<SceneHierarchyHistoryState>) => {
      const previousState = captureHistoryState()
      const nextState = captureHistoryState(nextValues)

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [applyHistoryState, captureHistoryState, recordHistoryTransition]
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

      const creationChange = buildSceneNodeCreationChange(documentSnapshot.nodes, type, parentId)

      commitHistoryValues({
        nodes: creationChange.nodes,
        selectedNodeId: creationChange.selectedNodeId
      })
      setEditingNode(creationChange.editingNode)
    },
    [canCreateNode, commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (!scene || editingNode) {
        return
      }

      const deletionChange = buildSceneNodeDeletionChange(documentSnapshot.nodes, clipboard, nodeId)

      if (!deletionChange) {
        return
      }

      commitHistoryValues(deletionChange)
    },
    [clipboard, commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const toggleCollapsed = useCallback(
    (nodeId: string) => {
      if (!scene) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        scriptProperties: documentSnapshot.scriptProperties,
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
      documentSnapshot.scriptProperties,
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

      const clipboardChange = buildSceneClipboardChange(documentSnapshot.nodes, nodeId, operation)

      if (!clipboardChange) {
        return
      }

      commitHistoryValues({
        selectedNodeId: clipboardChange.selectedNodeId,
        clipboard: clipboardChange.clipboard
      })
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
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

      const pasteChange = buildScenePasteChange(documentSnapshot.nodes, clipboard, targetParentId)

      if (!pasteChange) {
        return
      }

      commitHistoryValues({
        nodes: pasteChange.nodes,
        selectedNodeId: pasteChange.selectedNodeId,
        clipboard: pasteChange.clipboard
      })
    },
    [canPasteTo, clipboard, commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const commitRename = useCallback(() => {
    if (!scene || !editingNode) {
      return
    }

    const renameChange = buildSceneRenameChange(documentSnapshot.nodes, editingNode)

    if (!renameChange) {
      setEditingNode(null)
      return
    }

    commitHistoryValues({ nodes: renameChange.nodes })
    setEditingNode(null)
  }, [commitHistoryValues, documentSnapshot.nodes, editingNode, scene])

  const updateActor = useCallback(
    (
      nodeId: string,
      nextValues: Partial<Pick<SceneAssetActorNode, 'x' | 'y' | 'spritePath' | 'scriptPath'>>
    ) => {
      if (!scene || editingNode) {
        return
      }

      const actorChange = buildActorUpdateChange(documentSnapshot.nodes, nodeId, nextValues)

      if (!actorChange) {
        return
      }

      commitHistoryValues(actorChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const setSceneScriptPath = useCallback(
    (nextScriptPath: string | null) => {
      if (!scene || editingNode || nextScriptPath === documentSnapshot.scriptPath) {
        return
      }

      commitHistoryValues({ scriptPath: nextScriptPath })
    },
    [commitHistoryValues, documentSnapshot.scriptPath, editingNode, scene]
  )

  const setSceneScriptProperty = useCallback(
    (propertyName: string, propertyValue: ScriptPropertyValue) => {
      if (!scene || editingNode) {
        return
      }

      const nextScriptProperties = buildSceneScriptPropertyChange(
        documentSnapshot.scriptProperties,
        propertyName,
        propertyValue
      )

      if (nextScriptProperties === null) {
        return
      }

      commitHistoryValues({ scriptProperties: nextScriptProperties })
    },
    [commitHistoryValues, documentSnapshot.scriptProperties, editingNode, scene]
  )

  const setFollowedActor = useCallback(
    (nodeId: string | null) => {
      if (!scene || editingNode) {
        return
      }

      const followChange = buildFollowedActorChange(documentSnapshot.nodes, nodeId, selectedNodeId)

      if (!followChange) {
        return
      }

      commitHistoryValues(followChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene, selectedNodeId]
  )

  const setActorResourcePath = useCallback(
    (nodeId: string, resourcePath: string | null) => {
      if (!scene) {
        return
      }

      const nextNodes = buildActorResourcePathChange(documentSnapshot.nodes, nodeId, resourcePath)

      if (!nextNodes) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        scriptProperties: documentSnapshot.scriptProperties,
        tilemapPath: documentSnapshot.tilemapPath,
        windowPath: documentSnapshot.windowPath,
        nodes: nextNodes
      })
    },
    [
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.scriptProperties,
      documentSnapshot.tilemapPath,
      documentSnapshot.windowPath,
      publishDocumentSnapshot,
      scene
    ]
  )

  const setActorScriptProperty = useCallback(
    (nodeId: string, propertyName: string, propertyValue: ScriptPropertyValue) => {
      if (!scene || editingNode) {
        return
      }

      const actorPropertyChange = buildActorScriptPropertyChange(
        documentSnapshot.nodes,
        nodeId,
        propertyName,
        propertyValue
      )

      if (!actorPropertyChange) {
        return
      }

      commitHistoryValues(actorPropertyChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const setNodeTags = useCallback(
    (nodeId: string, tags: string[]) => {
      if (!scene || editingNode) {
        return
      }

      const tagChange = buildSceneNodeTagsChange(documentSnapshot.nodes, nodeId, tags)

      if (!tagChange) {
        return
      }

      commitHistoryValues(tagChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
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

      const collisionChange = buildCollisionUpdateChange(documentSnapshot.nodes, nodeId, nextValues)

      if (!collisionChange) {
        return
      }

      commitHistoryValues(collisionChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const setCollisionCallbacks = useCallback(
    (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => {
      if (!scene || editingNode) {
        return
      }

      const callbackChange = buildCollisionCallbacksChange(
        documentSnapshot.nodes,
        nodeId,
        callbacks
      )

      if (!callbackChange) {
        return
      }

      commitHistoryValues(callbackChange)
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const clampActorsToMap = useCallback(
    (mapSize: SceneMapSize | null) => {
      if (!scene || !mapSize) {
        return
      }

      const clampedNodes = clampSceneNodesToMap(documentSnapshot.nodes, mapSize)
      const hasChanges = clampedNodes.some((node, index) => node !== documentSnapshot.nodes[index])

      if (!hasChanges) {
        return
      }

      publishDocumentSnapshot({
        scriptPath: documentSnapshot.scriptPath,
        scriptProperties: documentSnapshot.scriptProperties,
        tilemapPath: documentSnapshot.tilemapPath,
        windowPath: documentSnapshot.windowPath,
        nodes: clampedNodes
      })
    },
    [
      documentSnapshot.nodes,
      documentSnapshot.scriptPath,
      documentSnapshot.scriptProperties,
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

      commitHistoryValues({
        tilemapPath: nextTilemapPath,
        nodes: buildTilemapPathChange(documentSnapshot.nodes, nextTilemapSize)
      })
    },
    [commitHistoryValues, documentSnapshot.nodes, documentSnapshot.tilemapPath, editingNode, scene]
  )

  const setWindowPath = useCallback(
    (nextWindowPath: string | null) => {
      if (!scene || editingNode || nextWindowPath === documentSnapshot.windowPath) {
        return
      }

      commitHistoryValues({ windowPath: nextWindowPath })
    },
    [commitHistoryValues, documentSnapshot.windowPath, editingNode, scene]
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

      commitHistoryValues(
        buildLoadedActorChange(documentSnapshot.nodes, parentId, actorRoot, placement, resourcePath)
      )
    },
    [commitHistoryValues, documentSnapshot.nodes, editingNode, scene]
  )

  const snapshotActor = useCallback(
    (nodeId: string) => {
      return snapshotSceneActor(documentSnapshot.nodes, nodeId)
    },
    [documentSnapshot.nodes]
  )

  return {
    canEdit,
    canUndo,
    canRedo,
    nodes: documentSnapshot.nodes,
    scriptPath: documentSnapshot.scriptPath,
    sceneScriptProperties: documentSnapshot.scriptProperties,
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
    setSceneScriptProperty,
    setActorScriptProperty,
    setSceneScriptPath,
    setActorResourcePath,
    setFollowedActor,
    setNodeTags,
    updateCollision,
    setCollisionCallbacks,
    clampActorsToMap,
    setTilemapPath,
    setWindowPath,
    loadActor,
    snapshotActor
  }
}
