export type ProjectAssetKind = 'sprite' | 'tileset' | 'tilemap' | 'scene'

export interface SceneAssetNode {
  id: string
  type: 'actor' | 'folder'
  name: string
  isCollapsed: boolean
  children: SceneAssetNode[]
}

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

export interface SceneAssetDocument {
  kind: 'scene'
  version: 1
  nodes: SceneAssetNode[]
}

export type ProjectAssetDocument =
  | SpriteAssetDocument
  | TilesetAssetDocument
  | TilemapAssetDocument
  | SceneAssetDocument

export const PROJECT_ASSET_EXTENSIONS: Record<ProjectAssetKind, string> = {
  sprite: '.rgbsprite.json',
  tileset: '.rgbtileset.json',
  tilemap: '.rgbtilemap.json',
  scene: '.rgbscene.json'
}

export const PROJECT_ASSET_LABELS: Record<ProjectAssetKind, string> = {
  sprite: 'Sprite',
  tileset: 'Tileset',
  tilemap: 'Tilemap',
  scene: 'Scene'
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
    case 'scene':
      return {
        kind: 'scene',
        version: 1,
        nodes: []
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

const isSceneAssetNode = (value: unknown): value is SceneAssetNode => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    (value.type === 'actor' || value.type === 'folder') &&
    typeof value.name === 'string' &&
    typeof value.isCollapsed === 'boolean' &&
    Array.isArray(value.children) &&
    value.children.every(isSceneAssetNode)
  )
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
    case 'scene':
      if (!Array.isArray(rawDocument.nodes) || !rawDocument.nodes.every(isSceneAssetNode)) {
        throw new Error('The scene asset file is invalid.')
      }

      return asAssetDocument<SceneAssetDocument>(rawDocument)
    default:
      throw new Error('The asset type is not supported.')
  }
}

export const serializeProjectAssetDocument = (assetDocument: ProjectAssetDocument): string => {
  return `${JSON.stringify(assetDocument, null, 2)}\n`
}
