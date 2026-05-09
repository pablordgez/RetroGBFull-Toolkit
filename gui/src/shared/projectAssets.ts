import type { ScriptPropertyMap, ScriptPropertyValue } from './projectScriptProperties'

export type ProjectAssetKind =
  | 'sprite'
  | 'tileset'
  | 'tilemap'
  | 'window'
  | 'scene'
  | 'actor'
  | 'music'

export const MUSIC_PATTERN_LENGTH = 16
export const MUSIC_NOTE_REST = 0xff
export const MUSIC_NOTE_COUNT = 72

export type MusicChannelKey = 'ch1' | 'ch2' | 'ch4'
export type MusicInstrumentKind = 'pulse' | 'noise'

export interface SceneAssetCollisionCallback {
  scriptPath: string
  functionName: string
}

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
  resourcePath?: string | null
  scriptPath?: string | null
  scriptProperties?: ScriptPropertyMap
  tags?: string[]
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
  tags?: string[]
  callbacks: SceneAssetCollisionCallback[]
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
  scriptPath: string | null
  scriptProperties?: ScriptPropertyMap
  nodes: SceneAssetNode[]
}

export interface ActorAssetDocument {
  kind: 'actor'
  version: 1
  root: SceneAssetActorNode
}

export interface MusicInstrument {
  name?: string
  channelType?: MusicInstrumentKind
  reg1: number
  reg2: number
  reg3: number
}

export interface MusicStep {
  noteIndex: number
  instrument: number
}

export interface MusicPattern {
  id: string
  name: string
  channel?: MusicChannelKey
  steps: MusicStep[]
}

export interface MusicAssetDocument {
  kind: 'music'
  version: 1
  speed: number
  loop: boolean
  instruments: MusicInstrument[]
  patterns: MusicPattern[]
  sequence: Record<MusicChannelKey, Array<string | null>>
}

export type ProjectAssetDocument =
  | SpriteAssetDocument
  | TilesetAssetDocument
  | TilemapAssetDocument
  | WindowAssetDocument
  | SceneAssetDocument
  | ActorAssetDocument
  | MusicAssetDocument

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

export const PROJECT_ASSET_EXTENSIONS: Record<ProjectAssetKind, string> = {
  sprite: '.rgbsprite.json',
  tileset: '.rgbtileset.json',
  tilemap: '.rgbtilemap.json',
  window: '.rgbwindow.json',
  scene: '.rgbscene.json',
  actor: '.rgbactor.json',
  music: '.rgbmusic.json'
}

export const PROJECT_ASSET_LABELS: Record<ProjectAssetKind, string> = {
  sprite: 'Sprite',
  tileset: 'Tileset',
  tilemap: 'Tilemap',
  window: 'Window',
  scene: 'Scene',
  actor: 'Actor',
  music: 'Music'
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

  // clamps a value to be between 0 and the clamped height and truncates it
  const clampRow = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 0
    }

    return Math.max(0, Math.min(clampedHeight, Math.trunc(value)))
  }

  const nextWindowTopEnd = clampRow(windowTopEnd)

  // if the top end is 0, the window is disabled (a bottom only window is a moved top only window)
  if (nextWindowTopEnd === 0) {
    return {
      windowTopEnd: 0,
      windowBottomStart: 0
    }
  }

  const nextWindowBottomStart = clampRow(windowBottomStart)

  // if the bottom start is 0, the window is a top only window
  if (nextWindowBottomStart === 0) {
    return {
      windowTopEnd: nextWindowTopEnd,
      windowBottomStart: 0
    }
  }

  // if the bottom start is greater than the top end, the window is a valid split window
  if (nextWindowBottomStart > nextWindowTopEnd) {
    return {
      windowTopEnd: nextWindowTopEnd,
      windowBottomStart: nextWindowBottomStart
    }
  }

  // otherwise, if the window top end is within bounds, the bottom start is normalized to one row after the top end
  // if the window top end is out of bounds, the bottom start is normalized to 0
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
        scriptPath: null,
        nodes: []
      }
    case 'actor':
      return {
        kind: 'actor',
        version: 1,
        root: createDefaultSceneActorNode()
      }
    case 'music':
      return {
        kind: 'music',
        version: 1,
        speed: 8,
        loop: true,
        instruments: [],
        patterns: [],
        sequence: {
          ch1: [null],
          ch2: [null],
          ch4: [null]
        }
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

const isByte = (value: unknown): value is number => {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xff
}

const isMusicNoteIndex = (value: unknown): value is number => {
  return (
    Number.isInteger(value) &&
    ((Number(value) >= 0 && Number(value) < MUSIC_NOTE_COUNT) || Number(value) === MUSIC_NOTE_REST)
  )
}

const isMusicStep = (value: unknown, instrumentCount: number): value is MusicStep => {
  return (
    isRecord(value) &&
    isMusicNoteIndex(value.noteIndex) &&
    Number.isInteger(value.instrument) &&
    Number(value.instrument) >= 0 &&
    (Number(value.instrument) < instrumentCount ||
      (instrumentCount === 0 && Number(value.noteIndex) === MUSIC_NOTE_REST && Number(value.instrument) === 0))
  )
}

const isMusicSequence = (
  value: unknown,
  patternIds: Set<string>
): value is Record<MusicChannelKey, Array<string | null>> => {
  if (!isRecord(value)) {
    return false
  }

  const channels: MusicChannelKey[] = ['ch1', 'ch2', 'ch4']
  return channels.every((channel) => {
    const sequence = value[channel]
    return (
      Array.isArray(sequence) &&
      sequence.every((entry) => entry === null || (typeof entry === 'string' && patternIds.has(entry)))
    )
  })
}

const normalizeSceneNodeTags = (value: unknown): string[] | undefined => {
  if (!isStringArray(value)) {
    return undefined
  }

  const tags = [...new Set(value.filter((entry) => entry.trim().length > 0))]
  return tags.length > 0 ? tags : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isOptionalString = (value: unknown): value is string | null | undefined => {
  return value === undefined || value === null || typeof value === 'string'
}

const isScriptPropertyValue = (value: unknown): value is ScriptPropertyValue => {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isInteger(value))
  )
}

const normalizeScriptProperties = (value: unknown): ScriptPropertyMap | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const entries = Object.entries(value).flatMap(([propertyName, propertyValue]) => {
    if (!isScriptPropertyValue(propertyValue)) {
      return []
    }

    return [[propertyName, propertyValue] as const]
  })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export const isSceneActorNode = (node: SceneAssetNode): node is SceneAssetActorNode => {
  return node.type === 'actor'
}

export const isSceneCollisionNode = (node: SceneAssetNode): node is SceneAssetCollisionNode => {
  return node.type === 'collision'
}

// ensures only one actor is followed by the camera in the scene and that only actors can be followed by the camera
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

// validates the structure of a scene node and its children and returns the normalized node or null if the structure is invalid
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
      isBlocking: value.isBlocking,
      ...(normalizeSceneNodeTags(value.tags) ? { tags: normalizeSceneNodeTags(value.tags) } : {}),
      callbacks: Array.isArray(value.callbacks)
        ? value.callbacks.flatMap((callback): SceneAssetCollisionCallback[] => {
            if (
              !isRecord(callback) ||
              typeof callback.scriptPath !== 'string' ||
              typeof callback.functionName !== 'string'
            ) {
              return []
            }

            return [
              {
                scriptPath: callback.scriptPath,
                functionName: callback.functionName
              }
            ]
          })
        : []
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
    ...(typeof value.resourcePath === 'string' && value.resourcePath.length > 0
      ? { resourcePath: value.resourcePath }
      : {}),
    ...(typeof value.scriptPath === 'string' && value.scriptPath.length > 0
      ? { scriptPath: value.scriptPath }
      : {}),
    ...(normalizeScriptProperties(value.scriptProperties)
      ? { scriptProperties: normalizeScriptProperties(value.scriptProperties) }
      : {}),
    ...(normalizeSceneNodeTags(value.tags) ? { tags: normalizeSceneNodeTags(value.tags) } : {}),
    x: Number.isInteger(value.x) ? Number(value.x) : 0,
    y: Number.isInteger(value.y) ? Number(value.y) : 0,
    followCamera: typeof value.followCamera === 'boolean' ? value.followCamera : false
  }
}

// serializes a scene node and its children from SceneAssetNode to a plain object
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
      children: childNodes.map((childNode) => serializeSceneAssetNode(childNode, includeResourcePath))
    }
  }

  if (node.type === 'collision') {
    const callbacks = Array.isArray(node.callbacks) ? node.callbacks : []

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
    ...(includeResourcePath &&
    typeof node.resourcePath === 'string' &&
    node.resourcePath.length > 0
      ? { resourcePath: node.resourcePath }
      : {}),
    ...(typeof node.scriptPath === 'string' && node.scriptPath.length > 0
      ? { scriptPath: node.scriptPath }
      : {}),
    ...(node.scriptProperties && Object.keys(node.scriptProperties).length > 0
      ? { scriptProperties: node.scriptProperties }
      : {}),
    ...(node.tags && node.tags.length > 0 ? { tags: node.tags } : {}),
    x: node.x,
    y: node.y,
    followCamera: node.followCamera,
    children: childNodes.map((childNode) => serializeSceneAssetNode(childNode, includeResourcePath))
  }
}


// validates that the raw document is a valid document kind with the required fields and if so returns the document casted to the
// specific type
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
        !isOptionalString(rawDocument.windowPath) ||
        !isOptionalString(rawDocument.scriptPath)
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
        scriptPath: rawDocument.scriptPath ?? null,
        ...(normalizeScriptProperties(rawDocument.scriptProperties)
          ? { scriptProperties: normalizeScriptProperties(rawDocument.scriptProperties) }
          : {}),
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
    case 'music': {
      const rawInstruments = rawDocument.instruments

      if (
        !Number.isInteger(rawDocument.speed) ||
        Number(rawDocument.speed) < 1 ||
        Number(rawDocument.speed) > 255 ||
        typeof rawDocument.loop !== 'boolean' ||
        !Array.isArray(rawInstruments) ||
        rawInstruments.length > 256 ||
        !rawInstruments.every(
          (instrument) =>
            isRecord(instrument) &&
            (instrument.name === undefined || typeof instrument.name === 'string') &&
            (instrument.channelType === undefined ||
              instrument.channelType === 'pulse' ||
              instrument.channelType === 'noise') &&
            isByte(instrument.reg1) &&
            isByte(instrument.reg2) &&
            isByte(instrument.reg3)
        ) ||
        !Array.isArray(rawDocument.patterns)
      ) {
        throw new Error('The music asset file is invalid.')
      }

      const patternIds = new Set<string>()

      for (const pattern of rawDocument.patterns) {
        if (
          !isRecord(pattern) ||
          typeof pattern.id !== 'string' ||
          pattern.id.trim().length === 0 ||
          typeof pattern.name !== 'string' ||
          (pattern.channel !== undefined &&
            pattern.channel !== 'ch1' &&
            pattern.channel !== 'ch2' &&
            pattern.channel !== 'ch4') ||
          !Array.isArray(pattern.steps) ||
          pattern.steps.length !== MUSIC_PATTERN_LENGTH ||
          !pattern.steps.every((step) => isMusicStep(step, rawInstruments.length))
        ) {
          throw new Error('The music asset file is invalid.')
        }

        if (patternIds.has(pattern.id)) {
          throw new Error('The music asset file is invalid.')
        }

        patternIds.add(pattern.id)
      }

      if (!isMusicSequence(rawDocument.sequence, patternIds)) {
        throw new Error('The music asset file is invalid.')
      }

      return asAssetDocument<MusicAssetDocument>(rawDocument)
    }
    default:
      throw new Error('The asset type is not supported.')
  }
}

// serializes a project asset to a JSON string
export const serializeProjectAssetDocument = (assetDocument: ProjectAssetDocument): string => {
  if (assetDocument.kind === 'scene') {
    const sceneNodes = Array.isArray(assetDocument.nodes) ? assetDocument.nodes : []

    return `${JSON.stringify(
      {
        kind: assetDocument.kind,
        version: assetDocument.version,
        tilemapPath: assetDocument.tilemapPath ?? null,
        windowPath: assetDocument.windowPath ?? null,
        scriptPath: assetDocument.scriptPath ?? null,
        ...(assetDocument.scriptProperties &&
        Object.keys(assetDocument.scriptProperties).length > 0
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
