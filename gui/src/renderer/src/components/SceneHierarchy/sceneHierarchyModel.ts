import type { SceneAssetNode } from '../../../../shared/projectAssets'

export type SceneHierarchyClipboardOperation = 'copy' | 'cut'

export interface SceneHierarchyClipboardState {
  operation: SceneHierarchyClipboardOperation
  node: SceneAssetNode
  sourceNodeId: string | null
}

export interface SceneHierarchyHistoryState {
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

export const getDefaultSceneNodeName = (type: SceneAssetNode['type']): string => {
  return type === 'actor' ? 'Actor' : 'Folder'
}

export const cloneSceneNodeSnapshot = (node: SceneAssetNode): SceneAssetNode => {
  return {
    ...node,
    children: node.children.map(cloneSceneNodeSnapshot)
  }
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

export const isValidScenePasteTarget = (
  nodes: SceneAssetNode[],
  clipboard: SceneHierarchyClipboardState | null,
  targetParentId: string | null
): boolean => {
  if (!clipboard) {
    return false
  }

  if (clipboard.operation === 'copy') {
    return true
  }

  if (!clipboard.sourceNodeId) {
    return false
  }

  if (!targetParentId) {
    return true
  }

  if (targetParentId === clipboard.sourceNodeId) {
    return false
  }

  const sourceNode = findSceneNodeById(nodes, clipboard.sourceNodeId)

  if (!sourceNode) {
    return false
  }

  return !sceneSubtreeContainsNodeId(sourceNode, targetParentId)
}
