import type { ScriptPropertyMap, ScriptPropertyValue } from './projectScriptProperties'
import type {
  ProjectAssetDocument,
  SceneAssetActorNode,
  SceneAssetCollisionCallback,
  SceneAssetDocument,
  SceneAssetNode
} from './projectAssetTypes'

export interface ProjectAssetReferenceRemapResult {
  document: ProjectAssetDocument
  changed: boolean
}

type ReferencePathChange =
  | { changed: false; value: string | null | undefined }
  | { changed: true; value: string | null | undefined }

const normalizeReferencePathForRemap = (resourcePath: string): string => {
  return resourcePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.')
    .join('/')
}

const isReferenceToRoot = (value: string, sourceRootPath: string): boolean => {
  const normalizedValue = normalizeReferencePathForRemap(value)
  return normalizedValue === sourceRootPath || normalizedValue.startsWith(`${sourceRootPath}/`)
}

const remapReferencePath = (
  value: string | null | undefined,
  sourceRootPath: string,
  targetRootPath: string
): ReferencePathChange => {
  if (typeof value !== 'string') {
    return { value, changed: false }
  }

  const normalizedValue = normalizeReferencePathForRemap(value)

  if (!normalizedValue) {
    return { value, changed: false }
  }

  if (normalizedValue === sourceRootPath) {
    return { value: targetRootPath, changed: targetRootPath !== value }
  }

  if (normalizedValue.startsWith(`${sourceRootPath}/`)) {
    const nextValue = `${targetRootPath}${normalizedValue.slice(sourceRootPath.length)}`
    return { value: nextValue, changed: nextValue !== value }
  }

  return { value, changed: false }
}

const clearReferencePath = (
  value: string | null | undefined,
  sourceRootPath: string
): ReferencePathChange => {
  if (typeof value !== 'string' || !isReferenceToRoot(value, sourceRootPath)) {
    return { value, changed: false }
  }

  return { value: null, changed: true }
}

const updateScriptProperties = (
  scriptProperties: ScriptPropertyMap | undefined,
  updateReference: (value: string | null | undefined) => ReferencePathChange
): { scriptProperties: ScriptPropertyMap | undefined; changed: boolean } => {
  if (!scriptProperties) {
    return { scriptProperties, changed: false }
  }

  let changed = false
  const nextEntries = Object.entries(scriptProperties).map(([propertyName, propertyValue]) => {
    if (typeof propertyValue !== 'string') {
      return [propertyName, propertyValue] as const
    }

    const updated = updateReference(propertyValue)
    changed = changed || updated.changed
    return [propertyName, updated.value as ScriptPropertyValue] as const
  })

  return {
    scriptProperties: changed ? Object.fromEntries(nextEntries) : scriptProperties,
    changed
  }
}

const updateSceneCollisionCallbacks = (
  callbacks: SceneAssetCollisionCallback[],
  updateReference: (value: string | null | undefined) => ReferencePathChange,
  options?: { removeClearedCallbacks?: boolean }
): { callbacks: SceneAssetCollisionCallback[]; changed: boolean } => {
  let changed = false
  const nextCallbacks = callbacks.flatMap((callback): SceneAssetCollisionCallback[] => {
    const scriptPath = updateReference(callback.scriptPath)

    if (!scriptPath.changed) {
      return [callback]
    }

    changed = true

    if (options?.removeClearedCallbacks && !scriptPath.value) {
      return []
    }

    return [
      {
        ...callback,
        scriptPath: scriptPath.value as string
      }
    ]
  })

  return { callbacks: changed ? nextCallbacks : callbacks, changed }
}

const updateSceneAssetNodeReferences = (
  node: SceneAssetNode,
  updateReference: (value: string | null | undefined) => ReferencePathChange,
  options?: { removeClearedCallbacks?: boolean }
): { node: SceneAssetNode; changed: boolean } => {
  if (node.type === 'folder') {
    let changed = false
    const nextChildren = node.children.map((childNode) => {
      const updatedChild = updateSceneAssetNodeReferences(childNode, updateReference, options)
      changed = changed || updatedChild.changed
      return updatedChild.node
    })

    return {
      node: changed ? { ...node, children: nextChildren } : node,
      changed
    }
  }

  if (node.type === 'collision') {
    const callbacks = updateSceneCollisionCallbacks(node.callbacks, updateReference, options)
    const exitCallbacks = updateSceneCollisionCallbacks(node.exitCallbacks, updateReference, options)
    const changed = callbacks.changed || exitCallbacks.changed

    return {
      node: changed
        ? {
            ...node,
            callbacks: callbacks.callbacks,
            exitCallbacks: exitCallbacks.callbacks
          }
        : node,
      changed
    }
  }

  const spritePath = updateReference(node.spritePath)
  const resourcePath = updateReference(node.resourcePath)
  const scriptPath = updateReference(node.scriptPath)
  const scriptProperties = updateScriptProperties(node.scriptProperties, updateReference)
  let childrenChanged = false
  const nextChildren = node.children.map((childNode) => {
    const updatedChild = updateSceneAssetNodeReferences(childNode, updateReference, options)
    childrenChanged = childrenChanged || updatedChild.changed
    return updatedChild.node
  })
  const changed =
    spritePath.changed ||
    resourcePath.changed ||
    scriptPath.changed ||
    scriptProperties.changed ||
    childrenChanged

  if (!changed) {
    return { node, changed: false }
  }

  const nextNode: SceneAssetActorNode = {
    ...node,
    spritePath: spritePath.value as string | null,
    children: nextChildren
  }

  if (typeof resourcePath.value === 'string' && resourcePath.value.length > 0) {
    nextNode.resourcePath = resourcePath.value
  } else if (resourcePath.changed) {
    delete nextNode.resourcePath
  }

  if (typeof scriptPath.value === 'string' && scriptPath.value.length > 0) {
    nextNode.scriptPath = scriptPath.value
  } else if (scriptPath.changed) {
    delete nextNode.scriptPath
  }

  if (scriptProperties.scriptProperties) {
    nextNode.scriptProperties = scriptProperties.scriptProperties
  }

  return { node: nextNode, changed: true }
}

const updateProjectAssetDocumentReferences = (
  document: ProjectAssetDocument,
  updateReference: (value: string | null | undefined) => ReferencePathChange,
  options?: { removeClearedCallbacks?: boolean }
): ProjectAssetReferenceRemapResult => {
  switch (document.kind) {
    case 'tilemap': {
      const tilesetPath = updateReference(document.tilesetPath)

      return {
        document: tilesetPath.changed
          ? { ...document, tilesetPath: tilesetPath.value as string | null }
          : document,
        changed: tilesetPath.changed
      }
    }
    case 'window': {
      const tilesetPath = updateReference(document.tilesetPath)

      return {
        document: tilesetPath.changed
          ? { ...document, tilesetPath: tilesetPath.value as string | null }
          : document,
        changed: tilesetPath.changed
      }
    }
    case 'scene': {
      const tilemapPath = updateReference(document.tilemapPath)
      const windowPath = updateReference(document.windowPath)
      const scriptPath = updateReference(document.scriptPath)
      const scriptProperties = updateScriptProperties(document.scriptProperties, updateReference)
      let nodesChanged = false
      const nextNodes = document.nodes.map((node) => {
        const updatedNode = updateSceneAssetNodeReferences(node, updateReference, options)
        nodesChanged = nodesChanged || updatedNode.changed
        return updatedNode.node
      })
      const changed =
        tilemapPath.changed ||
        windowPath.changed ||
        scriptPath.changed ||
        scriptProperties.changed ||
        nodesChanged

      if (!changed) {
        return { document, changed: false }
      }

      const nextDocument: SceneAssetDocument = {
        ...document,
        tilemapPath: tilemapPath.value as string | null,
        windowPath: windowPath.value as string | null,
        scriptPath: scriptPath.value as string | null,
        nodes: nextNodes
      }

      if (scriptProperties.scriptProperties) {
        nextDocument.scriptProperties = scriptProperties.scriptProperties
      }

      return { document: nextDocument, changed: true }
    }
    case 'actor': {
      const root = updateSceneAssetNodeReferences(document.root, updateReference, options)

      return {
        document: root.changed ? { ...document, root: root.node as SceneAssetActorNode } : document,
        changed: root.changed
      }
    }
    default:
      return { document, changed: false }
  }
}

export const remapProjectAssetDocumentReferences = (
  document: ProjectAssetDocument,
  sourceRootPath: string,
  targetRootPath: string
): ProjectAssetReferenceRemapResult => {
  const normalizedSourceRootPath = normalizeReferencePathForRemap(sourceRootPath)
  const normalizedTargetRootPath = normalizeReferencePathForRemap(targetRootPath)

  if (
    !normalizedSourceRootPath ||
    !normalizedTargetRootPath ||
    normalizedSourceRootPath === normalizedTargetRootPath
  ) {
    return { document, changed: false }
  }

  return updateProjectAssetDocumentReferences(document, (value) =>
    remapReferencePath(value, normalizedSourceRootPath, normalizedTargetRootPath)
  )
}

export const clearProjectAssetDocumentReferences = (
  document: ProjectAssetDocument,
  sourceRootPath: string
): ProjectAssetReferenceRemapResult => {
  const normalizedSourceRootPath = normalizeReferencePathForRemap(sourceRootPath)

  if (!normalizedSourceRootPath) {
    return { document, changed: false }
  }

  return updateProjectAssetDocumentReferences(
    document,
    (value) => clearReferencePath(value, normalizedSourceRootPath),
    { removeClearedCallbacks: true }
  )
}
