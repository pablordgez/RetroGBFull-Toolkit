export type ProjectAssetKind = 'sprite' | 'tileset' | 'tilemap' | 'window' | 'scene' | 'actor'

interface BaseSceneAssetNode {
  id: string
  name: string
  isCollapsed: boolean
  children: SceneAssetNode[]
}

export interface SceneAssetFolderNode extends BaseSceneAssetNode {
  type: 'folder'
}

export interface SceneAssetActorNode extends BaseSceneAssetNode {
  type: 'actor'
  spritePath: string | null
  x: number
  y: number
  followCamera: boolean
}

export interface SceneAssetCollisionNode extends BaseSceneAssetNode {
  type: 'collision'
  x: number
  y: number
  width: number
  height: number
  isBlocking: boolean
}

export type SceneAssetNode = SceneAssetFolderNode | SceneAssetActorNode | SceneAssetCollisionNode

export interface SpriteAssetDocument {
  kind: 'sprite'
  version: 1
  width: number
  height: number
  fps: number
  is8x16Mode: boolean
  currentFrame: number
  frames: number[][]
  palette: string[]
  selectedColor: number
}

export interface TilesetAssetDocument {
  kind: 'tileset'
  version: 1
  tiles: number[][]
  palette: string[]
  selectedColor: number
  selectedTileIndex: number
}

export interface TilemapAssetDocument {
  kind: 'tilemap'
  version: 1
  width: number
  height: number
  grid: number[]
  tilesetPath: string | null
  selectedTileIndex: number
  tool: 'brush' | 'fill'
}

export interface WindowAssetDocument {
  kind: 'window'
  version: 1
  width: number
  height: number
  grid: number[]
  tilesetPath: string | null
  selectedTileIndex: number
  tool: 'brush' | 'fill'
  windowTopEnd: number
  windowBottomStart: number
}

export interface SceneAssetDocument {
  kind: 'scene'
  version: 1
  tilemapPath: string | null
  windowPath: string | null
  nodes: SceneAssetNode[]
}

export interface ActorAssetDocument {
  kind: 'actor'
  version: 1
  root: SceneAssetActorNode
}

export type ProjectAssetDocument =
  | SpriteAssetDocument
  | TilesetAssetDocument
  | TilemapAssetDocument
  | WindowAssetDocument
  | SceneAssetDocument
  | ActorAssetDocument

export const createDefaultSceneActorNode = (name = 'Actor'): SceneAssetActorNode => {
  return {
    id: 'scene-actor-root',
    type: 'actor',
    name,
    isCollapsed: false,
    spritePath: null,
    x: 0,
    y: 0,
    followCamera: false,
    children: []
  }
}

export const createDefaultSceneCollisionNode = (name = 'Collision'): SceneAssetCollisionNode => {
  return {
    id: 'scene-collision-node',
    type: 'collision',
    name,
    isCollapsed: false,
    x: 0,
    y: 0,
    width: 128,
    height: 128,
    isBlocking: true,
    children: []
  }
}

export const PROJECT_ASSET_EXTENSIONS: Record<ProjectAssetKind, string> = {
  sprite: '.rgbsprite.json',
  tileset: '.rgbtileset.json',
  tilemap: '.rgbtilemap.json',
  window: '.rgbwindow.json',
  scene: '.rgbscene.json',
  actor: '.rgbactor.json'
}

export const PROJECT_ASSET_LABELS: Record<ProjectAssetKind, string> = {
  sprite: 'Sprite',
  tileset: 'Tileset',
  tilemap: 'Tilemap',
  window: 'Window',
  scene: 'Scene',
  actor: 'Actor'
}

export interface WindowSplitSettings {
  windowTopEnd: number
  windowBottomStart: number
}

export const normalizeWindowSplitSettings = (
  windowTopEnd: number,
  windowBottomStart: number,
  height: number
): WindowSplitSettings => {
  const clampedHeight = Math.max(0, Math.trunc(height))
  const clampRow = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 0
    }

    return Math.max(0, Math.min(clampedHeight, Math.trunc(value)))
  }

  const nextWindowTopEnd = clampRow(windowTopEnd)

  if (nextWindowTopEnd === 0) {
    return {
      windowTopEnd: 0,
      windowBottomStart: 0
    }
  }

  const nextWindowBottomStart = clampRow(windowBottomStart)

  if (nextWindowBottomStart === 0) {
    return {
      windowTopEnd: nextWindowTopEnd,
      windowBottomStart: 0
    }
  }

  if (nextWindowBottomStart > nextWindowTopEnd) {
    return {
      windowTopEnd: nextWindowTopEnd,
      windowBottomStart: nextWindowBottomStart
    }
  }

  const normalizedBottomStart =
    nextWindowTopEnd < clampedHeight ? Math.min(clampedHeight, nextWindowTopEnd + 1) : 0

  return {
    windowTopEnd: nextWindowTopEnd,
    windowBottomStart: normalizedBottomStart
  }
}

export const buildProjectAssetFileName = (
  assetKind: ProjectAssetKind,
  assetName: string
): string => {
  return `${assetName}${PROJECT_ASSET_EXTENSIONS[assetKind]}`
}

export const getProjectAssetKindFromFileName = (fileName: string): ProjectAssetKind | null => {
  const normalizedFileName = fileName.toLowerCase()

  for (const [assetKind, extension] of Object.entries(PROJECT_ASSET_EXTENSIONS) as Array<
    [ProjectAssetKind, string]
  >) {
    if (normalizedFileName.endsWith(extension)) {
      return assetKind
    }
  }

  return null
}

export const getProjectAssetDisplayName = (fileName: string): string => {
  const assetKind = getProjectAssetKindFromFileName(fileName)

  if (!assetKind) {
    return fileName
  }

  return fileName.slice(0, -PROJECT_ASSET_EXTENSIONS[assetKind].length)
}

export const createDefaultProjectAssetDocument = (
  assetKind: ProjectAssetKind
): ProjectAssetDocument => {
  switch (assetKind) {
    case 'sprite':
      return {
        kind: 'sprite',
        version: 1,
        width: 8,
        height: 8,
        fps: 6,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [new Array(64).fill(0)],
        palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
        selectedColor: 3
      }
    case 'tileset':
      return {
        kind: 'tileset',
        version: 1,
        tiles: [new Array(64).fill(0)],
        palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
        selectedColor: 3,
        selectedTileIndex: 0
      }
    case 'tilemap':
      return {
        kind: 'tilemap',
        version: 1,
        width: 20,
        height: 18,
        grid: new Array(20 * 18).fill(0),
        tilesetPath: null,
        selectedTileIndex: 0,
        tool: 'brush'
      }
    case 'window':
      return {
        kind: 'window',
        version: 1,
        width: 20,
        height: 18,
        grid: new Array(20 * 18).fill(0),
        tilesetPath: null,
        selectedTileIndex: 0,
        tool: 'brush',
        windowTopEnd: 0,
        windowBottomStart: 0
      }
    case 'scene':
      return {
        kind: 'scene',
        version: 1,
        tilemapPath: null,
        windowPath: null,
        nodes: []
      }
    case 'actor':
      return {
        kind: 'actor',
        version: 1,
        root: createDefaultSceneActorNode()
      }
  }
}

const asAssetDocument = <TDocument extends ProjectAssetDocument>(document: unknown): TDocument => {
  return document as TDocument
}

const isIntegerArray = (value: unknown): value is number[] => {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry))
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isOptionalString = (value: unknown): value is string | null | undefined => {
  return value === undefined || value === null || typeof value === 'string'
}

export const isSceneActorNode = (node: SceneAssetNode): node is SceneAssetActorNode => {
  return node.type === 'actor'
}

export const isSceneCollisionNode = (node: SceneAssetNode): node is SceneAssetCollisionNode => {
  return node.type === 'collision'
}

const normalizeSceneFollowCameraNodes = (nodes: SceneAssetNode[]): SceneAssetNode[] => {
  let hasFollowedActor = false

  const normalizeNode = (node: SceneAssetNode): SceneAssetNode => {
    if (node.type === 'folder') {
      return {
        ...node,
        children: node.children.map(normalizeNode)
      }
    }

    if (node.type === 'collision') {
      return {
        ...node,
        children: []
      }
    }

    const followCamera = !hasFollowedActor && node.followCamera

    if (followCamera) {
      hasFollowedActor = true
    }

    return {
      ...node,
      followCamera,
      children: node.children.map(normalizeNode)
    }
  }

  return nodes.map(normalizeNode)
}

const normalizeSceneAssetNode = (value: unknown): SceneAssetNode | null => {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.isCollapsed !== 'boolean' ||
    !Array.isArray(value.children)
  ) {
    return null
  }

  const normalizedChildren = value.children.map(normalizeSceneAssetNode)

  if (normalizedChildren.some((childNode) => childNode === null)) {
    return null
  }

  if (value.type === 'folder') {
    return {
      id: value.id,
      type: 'folder',
      name: value.name,
      isCollapsed: value.isCollapsed,
      children: normalizedChildren as SceneAssetNode[]
    }
  }

  if (value.type === 'collision') {
    if (
      normalizedChildren.length > 0 ||
      !Number.isInteger(value.x) ||
      !Number.isInteger(value.y) ||
      !Number.isInteger(value.width) ||
      !Number.isInteger(value.height) ||
      typeof value.isBlocking !== 'boolean'
    ) {
      return null
    }

    return {
      id: value.id,
      type: 'collision',
      name: value.name,
      isCollapsed: value.isCollapsed,
      children: [],
      x: Number(value.x),
      y: Number(value.y),
      width: Number(value.width),
      height: Number(value.height),
      isBlocking: value.isBlocking
    }
  }

  if (value.type !== 'actor') {
    return null
  }

  return {
    id: value.id,
    type: 'actor',
    name: value.name,
    isCollapsed: value.isCollapsed,
    children: normalizedChildren as SceneAssetNode[],
    spritePath: isOptionalString(value.spritePath) ? (value.spritePath ?? null) : null,
    x: Number.isInteger(value.x) ? Number(value.x) : 0,
    y: Number.isInteger(value.y) ? Number(value.y) : 0,
    followCamera: typeof value.followCamera === 'boolean' ? value.followCamera : false
  }
}

export const parseProjectAssetDocument = (rawDocument: unknown): ProjectAssetDocument => {
  if (!isRecord(rawDocument) || typeof rawDocument.kind !== 'string' || rawDocument.version !== 1) {
    throw new Error('The asset file is invalid.')
  }

  switch (rawDocument.kind) {
    case 'sprite':
      if (
        !Number.isInteger(rawDocument.width) ||
        !Number.isInteger(rawDocument.height) ||
        !Number.isInteger(rawDocument.fps) ||
        typeof rawDocument.is8x16Mode !== 'boolean' ||
        !Number.isInteger(rawDocument.currentFrame) ||
        !Array.isArray(rawDocument.frames) ||
        !rawDocument.frames.every(isIntegerArray) ||
        !isStringArray(rawDocument.palette) ||
        !Number.isInteger(rawDocument.selectedColor)
      ) {
        throw new Error('The sprite asset file is invalid.')
      }

      return asAssetDocument<SpriteAssetDocument>(rawDocument)
    case 'tileset':
      if (
        !Array.isArray(rawDocument.tiles) ||
        !rawDocument.tiles.every(isIntegerArray) ||
        !isStringArray(rawDocument.palette) ||
        !Number.isInteger(rawDocument.selectedColor) ||
        !Number.isInteger(rawDocument.selectedTileIndex)
      ) {
        throw new Error('The tileset asset file is invalid.')
      }

      return asAssetDocument<TilesetAssetDocument>(rawDocument)
    case 'tilemap':
      if (
        !Number.isInteger(rawDocument.width) ||
        !Number.isInteger(rawDocument.height) ||
        !isIntegerArray(rawDocument.grid) ||
        (rawDocument.tilesetPath !== undefined &&
          rawDocument.tilesetPath !== null &&
          typeof rawDocument.tilesetPath !== 'string') ||
        !Number.isInteger(rawDocument.selectedTileIndex) ||
        (rawDocument.tool !== 'brush' && rawDocument.tool !== 'fill')
      ) {
        throw new Error('The tilemap asset file is invalid.')
      }

      return asAssetDocument<TilemapAssetDocument>({
        ...rawDocument,
        tilesetPath: rawDocument.tilesetPath ?? null
      })
    case 'window': {
      if (
        !Number.isInteger(rawDocument.width) ||
        !Number.isInteger(rawDocument.height) ||
        !isIntegerArray(rawDocument.grid) ||
        (rawDocument.tilesetPath !== undefined &&
          rawDocument.tilesetPath !== null &&
          typeof rawDocument.tilesetPath !== 'string') ||
        !Number.isInteger(rawDocument.selectedTileIndex) ||
        (rawDocument.tool !== 'brush' && rawDocument.tool !== 'fill') ||
        !Number.isInteger(rawDocument.windowTopEnd) ||
        !Number.isInteger(rawDocument.windowBottomStart)
      ) {
        throw new Error('The window asset file is invalid.')
      }

      const splitSettings = normalizeWindowSplitSettings(
        Number(rawDocument.windowTopEnd),
        Number(rawDocument.windowBottomStart),
        Number(rawDocument.height)
      )

      return asAssetDocument<WindowAssetDocument>({
        ...rawDocument,
        tilesetPath: rawDocument.tilesetPath ?? null,
        ...splitSettings
      })
    }
    case 'scene': {
      if (
        !Array.isArray(rawDocument.nodes) ||
        !isOptionalString(rawDocument.tilemapPath) ||
        !isOptionalString(rawDocument.windowPath)
      ) {
        throw new Error('The scene asset file is invalid.')
      }

      const normalizedSceneNodes = rawDocument.nodes.map(normalizeSceneAssetNode)

      if (normalizedSceneNodes.some((node) => node === null)) {
        throw new Error('The scene asset file is invalid.')
      }

      return asAssetDocument<SceneAssetDocument>({
        ...rawDocument,
        tilemapPath: rawDocument.tilemapPath ?? null,
        windowPath: rawDocument.windowPath ?? null,
        nodes: normalizeSceneFollowCameraNodes(normalizedSceneNodes as SceneAssetNode[])
      })
    }
    case 'actor': {
      const normalizedRootNode = normalizeSceneAssetNode(rawDocument.root)

      if (!normalizedRootNode || normalizedRootNode.type !== 'actor') {
        throw new Error('The actor asset file is invalid.')
      }

      return asAssetDocument<ActorAssetDocument>({
        ...rawDocument,
        root: normalizedRootNode
      })
    }
    default:
      throw new Error('The asset type is not supported.')
  }
}

export const serializeProjectAssetDocument = (assetDocument: ProjectAssetDocument): string => {
  return `${JSON.stringify(assetDocument, null, 2)}\n`
}
