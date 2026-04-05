import { describe, expect, it } from 'vitest'
import {
  buildProjectAssetFileName,
  createDefaultProjectAssetDocument,
  parseProjectAssetDocument,
  serializeProjectAssetDocument,
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  normalizeWindowSplitSettings,
  type ActorAssetDocument,
  type SceneAssetDocument
} from '../../src/shared/projectAssets'

describe('projectAssets scene parsing', () => {
  it('parses an older scene actor without followCamera', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          x: 32,
          y: 48,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({
      type: 'actor',
      followCamera: false
    })
  })

  it('parses and serializes scene collision nodes', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'collision-1',
          type: 'collision',
          name: 'Wall',
          isCollapsed: false,
          x: 16,
          y: 32,
          width: 128,
          height: 64,
          isBlocking: true,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({
      type: 'collision',
      width: 128,
      height: 64,
      isBlocking: true
    })
    expect(serializeProjectAssetDocument(document)).toContain('"type": "collision"')
  })

  it('parses actor resources with collision children', () => {
    const document = parseProjectAssetDocument({
      kind: 'actor',
      version: 1,
      root: {
        id: 'hero',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: false,
        children: [
          {
            id: 'hero-collision',
            type: 'collision',
            name: 'Hitbox',
            isCollapsed: false,
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            isBlocking: true,
            children: []
          }
        ]
      }
    }) as ActorAssetDocument

    expect(document.root.children[0]).toMatchObject({
      type: 'collision',
      isBlocking: true
    })
  })

  it('serializes actor resource paths only in scene documents', () => {
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          resourcePath: 'Actors/Hero.rgbactor.json',
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        }
      ]
    }) as SceneAssetDocument
    const actorDocument = parseProjectAssetDocument({
      kind: 'actor',
      version: 1,
      root: {
        id: 'hero',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        resourcePath: 'Actors/Hero.rgbactor.json',
        x: 0,
        y: 0,
        followCamera: false,
        children: []
      }
    }) as ActorAssetDocument

    expect(serializeProjectAssetDocument(sceneDocument)).toContain('"resourcePath": "Actors/Hero.rgbactor.json"')
    expect(serializeProjectAssetDocument(actorDocument)).not.toContain('"resourcePath"')
  })

  it('normalizes multiple followed actors down to one in a scene document', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          x: 0,
          y: 0,
          followCamera: true,
          children: []
        },
        {
          id: 'enemy',
          type: 'actor',
          name: 'Enemy',
          isCollapsed: false,
          spritePath: null,
          x: 16,
          y: 0,
          followCamera: true,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({ followCamera: true })
    expect(document.nodes[1]).toMatchObject({ followCamera: false })
  })

  it('rejects malformed collision nodes', () => {
    expect(() =>
      parseProjectAssetDocument({
        kind: 'scene',
        version: 1,
        tilemapPath: null,
        windowPath: null,
        nodes: [
          {
            id: 'bad-collision',
            type: 'collision',
            name: 'Wall',
            isCollapsed: false,
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            isBlocking: true,
            children: [
              {
                id: 'nested',
                type: 'folder',
                name: 'Nested',
                isCollapsed: false,
                children: []
              }
            ]
          }
        ]
      })
    ).toThrow('The scene asset file is invalid.')
  })

  it('normalizes window split settings for full, top-only, and split windows', () => {
    expect(normalizeWindowSplitSettings(0, 8, 18)).toEqual({
      windowTopEnd: 0,
      windowBottomStart: 0
    })
    expect(normalizeWindowSplitSettings(4, 0, 18)).toEqual({
      windowTopEnd: 4,
      windowBottomStart: 0
    })
    expect(normalizeWindowSplitSettings(4, 2, 18)).toEqual({
      windowTopEnd: 4,
      windowBottomStart: 5
    })
    expect(normalizeWindowSplitSettings(4, 15, 18)).toEqual({
      windowTopEnd: 4,
      windowBottomStart: 15
    })
  })

  it('builds file names and resolves asset kinds and display names case-insensitively', () => {
    expect(buildProjectAssetFileName('sprite', 'Hero')).toBe('Hero.rgbsprite.json')
    expect(getProjectAssetKindFromFileName('HERO.RGBWINDOW.JSON')).toBe('window')
    expect(getProjectAssetKindFromFileName('README.md')).toBeNull()
    expect(getProjectAssetDisplayName('HUD.rgbwindow.json')).toBe('HUD')
    expect(getProjectAssetDisplayName('plain.txt')).toBe('plain.txt')
  })

  it('creates default documents for each asset kind', () => {
    expect(createDefaultProjectAssetDocument('sprite')).toMatchObject({
      kind: 'sprite',
      width: 8,
      height: 8
    })
    expect(createDefaultProjectAssetDocument('tileset')).toMatchObject({
      kind: 'tileset',
      selectedTileIndex: 0
    })
    expect(createDefaultProjectAssetDocument('tilemap')).toMatchObject({
      kind: 'tilemap',
      width: 20,
      height: 18
    })
    expect(createDefaultProjectAssetDocument('window')).toMatchObject({
      kind: 'window',
      windowTopEnd: 0,
      windowBottomStart: 0
    })
    expect(createDefaultProjectAssetDocument('scene')).toMatchObject({
      kind: 'scene',
      nodes: []
    })
    expect(createDefaultProjectAssetDocument('actor')).toMatchObject({
      kind: 'actor',
      root: {
        type: 'actor',
        followCamera: false
      }
    })
  })

  it('parses tilemap and window assets and normalizes optional fields', () => {
    expect(
      parseProjectAssetDocument({
        kind: 'tilemap',
        version: 1,
        width: 20,
        height: 18,
        grid: new Array(20 * 18).fill(0),
        selectedTileIndex: 0,
        tool: 'fill'
      })
    ).toMatchObject({
      kind: 'tilemap',
      tilesetPath: null,
      tool: 'fill'
    })

    expect(
      parseProjectAssetDocument({
        kind: 'window',
        version: 1,
        width: 20,
        height: 18,
        grid: new Array(20 * 18).fill(0),
        tilesetPath: undefined,
        selectedTileIndex: 0,
        tool: 'brush',
        windowTopEnd: 3,
        windowBottomStart: 1
      })
    ).toMatchObject({
      kind: 'window',
      tilesetPath: null,
      windowTopEnd: 3,
      windowBottomStart: 4
    })
  })

  it('rejects malformed sprite, tileset, tilemap, window, actor, and unsupported assets', () => {
    expect(() =>
      parseProjectAssetDocument({
        kind: 'sprite',
        version: 1,
        width: '8',
        height: 8,
        fps: 6,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [[0]],
        palette: ['#000000'],
        selectedColor: 0
      })
    ).toThrow('The sprite asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'tileset',
        version: 1,
        tiles: [[0], ['1']],
        palette: ['#000000'],
        selectedColor: 0,
        selectedTileIndex: 0
      })
    ).toThrow('The tileset asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'tilemap',
        version: 1,
        width: 20,
        height: 18,
        grid: ['0'],
        selectedTileIndex: 0,
        tool: 'brush'
      })
    ).toThrow('The tilemap asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'window',
        version: 1,
        width: 20,
        height: 18,
        grid: new Array(20 * 18).fill(0),
        selectedTileIndex: 0,
        tool: 'line',
        windowTopEnd: 0,
        windowBottomStart: 0
      })
    ).toThrow('The window asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'actor',
        version: 1,
        root: {
          id: 'folder-root',
          type: 'folder',
          name: 'Not an actor',
          isCollapsed: false,
          children: []
        }
      })
    ).toThrow('The actor asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'music',
        version: 1
      })
    ).toThrow('The asset type is not supported.')
  })
})
