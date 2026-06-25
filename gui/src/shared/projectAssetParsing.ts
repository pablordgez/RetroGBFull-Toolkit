import type { ScriptPropertyMap, ScriptPropertyValue } from './projectScriptProperties'
import {
  normalizeProjectPalette,
  normalizeSceneSpritePalettes,
  normalizeSpritePaletteIndex
} from './projectPalettes'
import {
  DEFAULT_SCENE_ACTOR_PHYSICS_MODE,
  MUSIC_NOTE_COUNT,
  MUSIC_NOTE_REST,
  MUSIC_PATTERN_LENGTH,
  normalizeSceneCameraDeadzone,
  type ActorAssetDocument,
  type MusicChannelKey,
  type MusicStep,
  type ProjectAssetDocument,
  type SceneActorPhysicsMode,
  type SceneAssetActorNode,
  type SceneAssetCollisionCallback,
  type SceneAssetCollisionNode,
  type SceneAssetDocument,
  type SceneAssetNode,
  type SpriteAssetDocument,
  type TilemapAssetDocument,
  type TilesetAssetDocument,
  type WindowAssetDocument
} from './projectAssetTypes'

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

const asAssetDocument = <TDocument extends ProjectAssetDocument>(document: unknown): TDocument => {
  return document as TDocument
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isIntegerArray = (value: unknown): value is number[] => {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry))
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

const isOptionalString = (value: unknown): value is string | null | undefined => {
  return value === undefined || value === null || typeof value === 'string'
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
      (instrumentCount === 0 &&
        Number(value.noteIndex) === MUSIC_NOTE_REST &&
        Number(value.instrument) === 0))
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
      sequence.every(
        (entry) => entry === null || (typeof entry === 'string' && patternIds.has(entry))
      )
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

const normalizeOptionalPalette = (value: unknown): string[] | null => {
  return isStringArray(value) ? normalizeProjectPalette(value) : null
}

export const isSceneActorPhysicsMode = (value: unknown): value is SceneActorPhysicsMode => {
  return value === 'highPerf' || value === 'balanced' || value === 'highFidelity'
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

const normalizeSceneCollisionCallbacks = (value: unknown): SceneAssetCollisionCallback[] => {
  return Array.isArray(value)
    ? value.flatMap((callback): SceneAssetCollisionCallback[] => {
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
      callbacks: normalizeSceneCollisionCallbacks(value.callbacks),
      exitCallbacks: normalizeSceneCollisionCallbacks(value.exitCallbacks)
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
    spritePaletteIndex: normalizeSpritePaletteIndex(value.spritePaletteIndex),
    x: Number.isInteger(value.x) ? Number(value.x) : 0,
    y: Number.isInteger(value.y) ? Number(value.y) : 0,
    physicsMode: isSceneActorPhysicsMode(value.physicsMode)
      ? value.physicsMode
      : DEFAULT_SCENE_ACTOR_PHYSICS_MODE,
    followCamera: typeof value.followCamera === 'boolean' ? value.followCamera : false,
    cameraDeadzone: normalizeSceneCameraDeadzone(value.cameraDeadzone)
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
        spritePalettes: Array.isArray(rawDocument.spritePalettes)
          ? normalizeSceneSpritePalettes(rawDocument.spritePalettes)
          : [normalizeOptionalPalette(rawDocument.spritePalette), null],
        spritePalette: normalizeOptionalPalette(rawDocument.spritePalette),
        backgroundPalette: normalizeOptionalPalette(rawDocument.backgroundPalette),
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

      return asAssetDocument(rawDocument)
    }
    default:
      throw new Error('The asset type is not supported.')
  }
}
