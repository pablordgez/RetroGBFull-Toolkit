import {
  normalizeProjectPalette,
  normalizeSceneSpritePalettes,
  normalizeSpritePaletteIndex
} from './projectPalettes'
import {
  normalizeSceneCameraDeadzone,
  type ProjectAssetDocument,
  type SceneAssetNode
} from './projectAssetTypes'

const serializeSceneAssetNode = (
  node: SceneAssetNode,
  includeResourcePath = false
): Record<string, unknown> => {
  if (node.type === 'folder') {
    const childNodes = Array.isArray(node.children) ? node.children : []

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      isCollapsed: node.isCollapsed,
      children: childNodes.map((childNode) =>
        serializeSceneAssetNode(childNode, includeResourcePath)
      )
    }
  }

  if (node.type === 'collision') {
    const callbacks = Array.isArray(node.callbacks) ? node.callbacks : []
    const exitCallbacks = Array.isArray(node.exitCallbacks) ? node.exitCallbacks : []

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      isCollapsed: node.isCollapsed,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      isBlocking: node.isBlocking,
      ...(node.tags && node.tags.length > 0 ? { tags: node.tags } : {}),
      callbacks: callbacks.map((callback) => ({
        scriptPath: callback.scriptPath,
        functionName: callback.functionName
      })),
      exitCallbacks: exitCallbacks.map((callback) => ({
        scriptPath: callback.scriptPath,
        functionName: callback.functionName
      })),
      children: []
    }
  }

  const childNodes = Array.isArray(node.children) ? node.children : []

  return {
    id: node.id,
    type: node.type,
    name: node.name,
    isCollapsed: node.isCollapsed,
    spritePath: node.spritePath,
    ...(includeResourcePath && typeof node.resourcePath === 'string' && node.resourcePath.length > 0
      ? { resourcePath: node.resourcePath }
      : {}),
    ...(typeof node.scriptPath === 'string' && node.scriptPath.length > 0
      ? { scriptPath: node.scriptPath }
      : {}),
    ...(node.scriptProperties && Object.keys(node.scriptProperties).length > 0
      ? { scriptProperties: node.scriptProperties }
      : {}),
    ...(node.tags && node.tags.length > 0 ? { tags: node.tags } : {}),
    spritePaletteIndex: normalizeSpritePaletteIndex(node.spritePaletteIndex),
    x: node.x,
    y: node.y,
    physicsMode: node.physicsMode,
    drawAt30Hz: node.drawAt30Hz ?? false,
    followCamera: node.followCamera,
    cameraDeadzone: normalizeSceneCameraDeadzone(node.cameraDeadzone),
    children: childNodes.map((childNode) => serializeSceneAssetNode(childNode, includeResourcePath))
  }
}

export const serializeProjectAssetDocument = (assetDocument: ProjectAssetDocument): string => {
  if (assetDocument.kind === 'scene') {
    const sceneNodes = Array.isArray(assetDocument.nodes) ? assetDocument.nodes : []

    return `${JSON.stringify(
      {
        kind: assetDocument.kind,
        version: assetDocument.version,
        tilemapPath: assetDocument.tilemapPath ?? null,
        windowPath: assetDocument.windowPath ?? null,
        spritePalettes: assetDocument.spritePalettes
          ? normalizeSceneSpritePalettes(assetDocument.spritePalettes)
          : [
              assetDocument.spritePalette
                ? normalizeProjectPalette(assetDocument.spritePalette)
                : null,
              null
            ],
        backgroundPalette: assetDocument.backgroundPalette
          ? normalizeProjectPalette(assetDocument.backgroundPalette)
          : null,
        scriptPath: assetDocument.scriptPath ?? null,
        collisionCallbacksAt30Hz: assetDocument.collisionCallbacksAt30Hz ?? false,
        ...(assetDocument.scriptProperties && Object.keys(assetDocument.scriptProperties).length > 0
          ? { scriptProperties: assetDocument.scriptProperties }
          : {}),
        nodes: sceneNodes.map((node) => serializeSceneAssetNode(node, true))
      },
      null,
      2
    )}\n`
  }

  if (assetDocument.kind === 'actor') {
    return `${JSON.stringify(
      {
        kind: assetDocument.kind,
        version: assetDocument.version,
        root: serializeSceneAssetNode(assetDocument.root)
      },
      null,
      2
    )}\n`
  }

  return `${JSON.stringify(assetDocument, null, 2)}\n`
}
