import { DEFAULT_GB_PALETTE } from './projectPalettes'
import {
  DEFAULT_SCENE_CAMERA_DEADZONE,
  DEFAULT_SCENE_ACTOR_PHYSICS_MODE,
  type ProjectAssetDocument,
  type ProjectAssetKind,
  type SceneAssetActorNode
} from './projectAssetTypes'

export const createDefaultSceneActorNode = (name = 'Actor'): SceneAssetActorNode => {
  return {
    id: 'scene-actor-root',
    type: 'actor',
    name,
    isCollapsed: false,
    spritePath: null,
    x: 0,
    y: 0,
    physicsMode: DEFAULT_SCENE_ACTOR_PHYSICS_MODE,
    drawAt30Hz: false,
    followCamera: false,
    cameraDeadzone: { ...DEFAULT_SCENE_CAMERA_DEADZONE },
    spritePaletteIndex: 0,
    children: []
  }
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
        palette: [...DEFAULT_GB_PALETTE],
        selectedColor: 3
      }
    case 'tileset':
      return {
        kind: 'tileset',
        version: 1,
        tiles: [new Array(64).fill(0)],
        palette: [...DEFAULT_GB_PALETTE],
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
        windowVisibilityBands: [{ start: 0, end: 144 }]
      }
    case 'scene':
      return {
        kind: 'scene',
        version: 1,
        tilemapPath: null,
        windowPath: null,
        spritePalette: null,
        spritePalettes: [null, null],
        backgroundPalette: null,
        scriptPath: null,
        collisionCallbacksAt30Hz: false,
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
