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
