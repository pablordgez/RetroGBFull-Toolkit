import type { ScriptPropertyMap } from './projectScriptProperties'
import type { SceneSpritePaletteIndex, SceneSpritePalettes } from './projectPalettes'

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
  spritePaletteIndex?: SceneSpritePaletteIndex
  x: number
  y: number
  physicsMode: SceneActorPhysicsMode
  followCamera: boolean
  cameraDeadzone?: SceneCameraDeadzone
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
  exitCallbacks: SceneAssetCollisionCallback[]
}

export type SceneAssetNode = SceneAssetFolderNode | SceneAssetActorNode | SceneAssetCollisionNode

export type SceneActorPhysicsMode = 'highPerf' | 'balanced' | 'highFidelity'

export interface SceneCameraDeadzone {
  left: number
  right: number
  top: number
  bottom: number
}

export const DEFAULT_SCENE_CAMERA_DEADZONE: SceneCameraDeadzone = {
  left: 20,
  right: 20,
  top: 20,
  bottom: 20
}

export const SCENE_CAMERA_DEADZONE_LIMITS: SceneCameraDeadzone = {
  left: 160,
  right: 160,
  top: 144,
  bottom: 144
}

export const normalizeSceneCameraDeadzoneValue = (value: unknown, maxValue: number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.max(0, Math.min(maxValue, Math.trunc(numericValue)))
}

export const normalizeSceneCameraDeadzone = (value: unknown): SceneCameraDeadzone => {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_SCENE_CAMERA_DEADZONE }
  }

  const deadzone = value as Partial<Record<keyof SceneCameraDeadzone, unknown>>

  return {
    left: normalizeSceneCameraDeadzoneValue(
      deadzone.left ?? DEFAULT_SCENE_CAMERA_DEADZONE.left,
      SCENE_CAMERA_DEADZONE_LIMITS.left
    ),
    right: normalizeSceneCameraDeadzoneValue(
      deadzone.right ?? DEFAULT_SCENE_CAMERA_DEADZONE.right,
      SCENE_CAMERA_DEADZONE_LIMITS.right
    ),
    top: normalizeSceneCameraDeadzoneValue(
      deadzone.top ?? DEFAULT_SCENE_CAMERA_DEADZONE.top,
      SCENE_CAMERA_DEADZONE_LIMITS.top
    ),
    bottom: normalizeSceneCameraDeadzoneValue(
      deadzone.bottom ?? DEFAULT_SCENE_CAMERA_DEADZONE.bottom,
      SCENE_CAMERA_DEADZONE_LIMITS.bottom
    )
  }
}

export const SCENE_ACTOR_PHYSICS_MODES: SceneActorPhysicsMode[] = [
  'highPerf',
  'balanced',
  'highFidelity'
]

export const DEFAULT_SCENE_ACTOR_PHYSICS_MODE: SceneActorPhysicsMode = 'balanced'

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
  spritePalettes?: SceneSpritePalettes
  spritePalette?: string[] | null
  backgroundPalette?: string[] | null
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
