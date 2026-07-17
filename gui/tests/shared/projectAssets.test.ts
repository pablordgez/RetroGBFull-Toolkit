import { describe, expect, it } from 'vitest'
import {
  buildProjectAssetFileName,
  clearProjectAssetDocumentReferences,
  createDefaultProjectAssetDocument,
  parseProjectAssetDocument,
  remapProjectAssetDocumentReferences,
  serializeProjectAssetDocument,
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  normalizeLegacyWindowVisibilityBands,
  normalizeWindowVisibilityBands,
  normalizeWindowVisibilityTileBands,
  WINDOW_VISIBILITY_MAX_BANDS,
  type ActorAssetDocument,
  type MusicAssetDocument,
  type SceneAssetDocument
} from '../../src/shared/projectAssets'

describe('projectAssets scene parsing', () => {
  it('parses an older scene actor without followCamera or physicsMode', () => {
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
      physicsMode: 'balanced',
      drawAt30Hz: false,
      followCamera: false,
      cameraDeadzone: {
        left: 20,
        right: 20,
        top: 20,
        bottom: 20
      }
    })
    expect(document.collisionCallbacksAt30Hz).toBe(false)
  })

  it('round-trips optional 30 Hz scene and actor settings', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      scriptPath: null,
      collisionCallbacksAt30Hz: true,
      nodes: [
        {
          id: 'enemy',
          type: 'actor',
          name: 'Enemy',
          isCollapsed: false,
          spritePath: null,
          x: 0,
          y: 0,
          physicsMode: 'balanced',
          drawAt30Hz: true,
          followCamera: false,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.collisionCallbacksAt30Hz).toBe(true)
    expect(document.nodes[0]).toMatchObject({ type: 'actor', drawAt30Hz: true })
    expect(serializeProjectAssetDocument(document)).toContain('"collisionCallbacksAt30Hz": true')
    expect(serializeProjectAssetDocument(document)).toContain('"drawAt30Hz": true')
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
          callbacks: [
            {
              scriptPath: 'src/CustomActors/Hero.c',
              functionName: 'OnCollision'
            }
          ],
          exitCallbacks: [
            {
              scriptPath: 'src/CustomActors/Hero.c',
              functionName: 'OnCollisionExit'
            }
          ],
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({
      type: 'collision',
      width: 128,
      height: 64,
      isBlocking: true,
      exitCallbacks: [
        {
          scriptPath: 'src/CustomActors/Hero.c',
          functionName: 'OnCollisionExit'
        }
      ]
    })
    expect(serializeProjectAssetDocument(document)).toContain('"exitCallbacks"')
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

  it('round-trips actor and collision tags in scene and actor resources', () => {
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      scriptPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          tags: ['player', 'spawn'],
          x: 0,
          y: 0,
          physicsMode: 'highFidelity',
          followCamera: false,
          cameraDeadzone: {
            left: -1,
            right: 999,
            top: 12.8,
            bottom: 30
          },
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
              tags: ['hurtbox'],
              children: []
            }
          ]
        }
      ]
    }) as SceneAssetDocument
    const actorDocument = parseProjectAssetDocument({
      kind: 'actor',
      version: 1,
      root: sceneDocument.nodes[0]
    }) as ActorAssetDocument

    expect(sceneDocument.nodes[0]).toMatchObject({ type: 'actor', tags: ['player', 'spawn'] })
    expect(sceneDocument.nodes[0]).toMatchObject({ type: 'actor', physicsMode: 'highFidelity' })
    expect(sceneDocument.nodes[0]).toMatchObject({
      type: 'actor',
      cameraDeadzone: {
        left: 0,
        right: 160,
        top: 12,
        bottom: 30
      }
    })
    expect(actorDocument.root.children[0]).toMatchObject({
      type: 'collision',
      tags: ['hurtbox']
    })
    expect(serializeProjectAssetDocument(sceneDocument)).toContain('"tags"')
    expect(serializeProjectAssetDocument(sceneDocument)).toContain('"physicsMode": "highFidelity"')
    expect(serializeProjectAssetDocument(actorDocument)).toContain('"tags"')
  })

  it('round-trips scene and actor script properties without breaking older assets', () => {
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      scriptPath: 'src/CustomScenes/Room.c',
      scriptProperties: {
        speed: 3,
        active: true,
        idle_animation: 'Sprites/Hero.rgbsprite.json',
        optional_animation: null
      },
      nodes: []
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
        scriptPath: 'src/CustomActors/Hero.c',
        scriptProperties: {
          speed: 5,
          active: false,
          idle_animation: 'Sprites/Hero.rgbsprite.json'
        },
        x: 0,
        y: 0,
        followCamera: false,
        children: []
      }
    }) as ActorAssetDocument

    expect(sceneDocument.scriptProperties).toEqual({
      speed: 3,
      active: true,
      idle_animation: 'Sprites/Hero.rgbsprite.json',
      optional_animation: null
    })
    expect(actorDocument.root.scriptProperties).toEqual({
      speed: 5,
      active: false,
      idle_animation: 'Sprites/Hero.rgbsprite.json'
    })
    expect(serializeProjectAssetDocument(sceneDocument)).toContain('"scriptProperties"')
    expect(serializeProjectAssetDocument(actorDocument)).toContain('"scriptProperties"')
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

    expect(serializeProjectAssetDocument(sceneDocument)).toContain(
      '"resourcePath": "Actors/Hero.rgbactor.json"'
    )
    expect(serializeProjectAssetDocument(actorDocument)).not.toContain('"resourcePath"')
  })

  it('remaps asset references across documents with exact and folder-prefix matches only', () => {
    const tilemapDocument = parseProjectAssetDocument({
      kind: 'tilemap',
      version: 1,
      width: 20,
      height: 18,
      grid: new Array(20 * 18).fill(0),
      tilesetPath: 'Assets/Tilesets/Main.rgbtileset.json',
      selectedTileIndex: 0,
      tool: 'brush'
    })
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: 'Assets/Maps/Room.rgbtilemap.json',
      windowPath: 'Assets2/Windows/HUD.rgbwindow.json',
      scriptPath: 'src/CustomScenes/Room.c',
      scriptProperties: {
        map: 'Assets/Maps/Room.rgbtilemap.json'
      },
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          resourcePath: 'Assets/Actors/Hero.rgbactor.json',
          spritePath: 'Assets/Sprites/Hero.rgbsprite.json',
          scriptPath: 'src/CustomActors/Hero.c',
          scriptProperties: {
            idle_animation: 'Assets/Sprites/Hero.rgbsprite.json'
          },
          x: 0,
          y: 0,
          followCamera: false,
          children: [
            {
              id: 'hitbox',
              type: 'collision',
              name: 'Hitbox',
              isCollapsed: false,
              x: 0,
              y: 0,
              width: 8,
              height: 8,
              isBlocking: true,
              callbacks: [{ scriptPath: 'Assets/Scripts/Shared.c', functionName: 'OnEnter' }],
              exitCallbacks: [],
              children: []
            }
          ]
        }
      ]
    }) as SceneAssetDocument

    const remappedTilemap = remapProjectAssetDocumentReferences(
      tilemapDocument,
      'Assets',
      'Archive/Assets'
    )
    const remappedScene = remapProjectAssetDocumentReferences(
      sceneDocument,
      'Assets',
      'Archive/Assets'
    )

    expect(remappedTilemap.changed).toBe(true)
    expect(remappedTilemap.document).toMatchObject({
      tilesetPath: 'Archive/Assets/Tilesets/Main.rgbtileset.json'
    })
    expect(remappedScene.changed).toBe(true)
    expect(remappedScene.document).toMatchObject({
      tilemapPath: 'Archive/Assets/Maps/Room.rgbtilemap.json',
      windowPath: 'Assets2/Windows/HUD.rgbwindow.json',
      scriptProperties: {
        map: 'Archive/Assets/Maps/Room.rgbtilemap.json'
      }
    })
    expect((remappedScene.document as SceneAssetDocument).nodes[0]).toMatchObject({
      resourcePath: 'Archive/Assets/Actors/Hero.rgbactor.json',
      spritePath: 'Archive/Assets/Sprites/Hero.rgbsprite.json',
      scriptProperties: {
        idle_animation: 'Archive/Assets/Sprites/Hero.rgbsprite.json'
      }
    })
    expect((remappedScene.document as SceneAssetDocument).nodes[0].children[0]).toMatchObject({
      callbacks: [{ scriptPath: 'Archive/Assets/Scripts/Shared.c', functionName: 'OnEnter' }]
    })
  })

  it('clears deleted asset references and keeps dependent documents valid', () => {
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: 'Assets/Maps/Room.rgbtilemap.json',
      windowPath: 'Assets/Windows/HUD.rgbwindow.json',
      scriptPath: 'Assets/Scripts/Room.c',
      scriptProperties: {
        map: 'Assets/Maps/Room.rgbtilemap.json',
        enabled: true
      },
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          resourcePath: 'Assets/Actors/Hero.rgbactor.json',
          spritePath: 'Assets/Sprites/Hero.rgbsprite.json',
          scriptPath: 'Assets/Scripts/Hero.c',
          scriptProperties: {
            idle_animation: 'Assets/Sprites/Hero.rgbsprite.json'
          },
          x: 0,
          y: 0,
          followCamera: false,
          children: [
            {
              id: 'hitbox',
              type: 'collision',
              name: 'Hitbox',
              isCollapsed: false,
              x: 0,
              y: 0,
              width: 8,
              height: 8,
              isBlocking: true,
              callbacks: [{ scriptPath: 'Assets/Scripts/Hero.c', functionName: 'OnEnter' }],
              exitCallbacks: [{ scriptPath: 'Other/Scripts/Hero.c', functionName: 'OnExit' }],
              children: []
            }
          ]
        }
      ]
    }) as SceneAssetDocument

    const cleared = clearProjectAssetDocumentReferences(sceneDocument, 'Assets')

    expect(cleared.changed).toBe(true)
    expect(cleared.document).toMatchObject({
      tilemapPath: null,
      windowPath: null,
      scriptPath: null,
      scriptProperties: {
        map: null,
        enabled: true
      }
    })
    expect((cleared.document as SceneAssetDocument).nodes[0]).toMatchObject({
      type: 'actor',
      spritePath: null,
      scriptProperties: {
        idle_animation: null
      }
    })
    expect((cleared.document as SceneAssetDocument).nodes[0]).not.toHaveProperty('resourcePath')
    expect((cleared.document as SceneAssetDocument).nodes[0]).not.toHaveProperty('scriptPath')
    expect((cleared.document as SceneAssetDocument).nodes[0].children[0]).toMatchObject({
      callbacks: [],
      exitCallbacks: [{ scriptPath: 'Other/Scripts/Hero.c', functionName: 'OnExit' }]
    })
    expect(() => parseProjectAssetDocument(cleared.document)).not.toThrow()
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

  it('normalizes window visibility bands and legacy split settings', () => {
    expect(
      normalizeWindowVisibilityBands([
        { start: 12.8, end: 16.9 },
        { start: -5, end: 4 },
        { start: 16, end: 20 },
        { start: 20, end: 20 },
        { start: 150, end: 160 }
      ])
    ).toEqual([
      { start: 0, end: 4 },
      { start: 16, end: 20 }
    ])

    expect(
      normalizeWindowVisibilityBands(
        Array.from({ length: WINDOW_VISIBILITY_MAX_BANDS + 1 }, (_, index) => ({
          start: index * 2,
          end: index * 2 + 1
        }))
      )
    ).toHaveLength(WINDOW_VISIBILITY_MAX_BANDS)

    expect(
      normalizeWindowVisibilityTileBands([
        { start: 5, end: 10 },
        { start: 25, end: 31 }
      ])
    ).toEqual([
      { start: 0, end: 16 },
      { start: 24, end: 32 }
    ])

    expect(normalizeLegacyWindowVisibilityBands(0, 8, 18)).toEqual([{ start: 0, end: 144 }])
    expect(normalizeLegacyWindowVisibilityBands(4, 0, 18)).toEqual([{ start: 0, end: 32 }])
    expect(normalizeLegacyWindowVisibilityBands(4, 2, 18)).toEqual([
      { start: 0, end: 32 },
      { start: 40, end: 144 }
    ])
    expect(normalizeLegacyWindowVisibilityBands(4, 15, 18, 112)).toEqual([{ start: 112, end: 144 }])
  })

  it('builds file names and resolves asset kinds and display names case-insensitively', () => {
    expect(buildProjectAssetFileName('sprite', 'Hero')).toBe('Hero.rgbsprite.json')
    expect(getProjectAssetKindFromFileName('HERO.RGBWINDOW.JSON')).toBe('window')
    expect(getProjectAssetKindFromFileName('BATTLE.RGBMUSIC.JSON')).toBe('music')
    expect(getProjectAssetKindFromFileName('README.md')).toBeNull()
    expect(getProjectAssetDisplayName('HUD.rgbwindow.json')).toBe('HUD')
    expect(getProjectAssetDisplayName('Battle.rgbmusic.json')).toBe('Battle')
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
      windowVisibilityBands: [{ start: 0, end: 144 }]
    })
    expect(createDefaultProjectAssetDocument('scene')).toMatchObject({
      kind: 'scene',
      nodes: []
    })
    expect(createDefaultProjectAssetDocument('actor')).toMatchObject({
      kind: 'actor',
      root: {
        type: 'actor',
        physicsMode: 'balanced',
        followCamera: false
      }
    })
    expect(createDefaultProjectAssetDocument('music')).toMatchObject({
      kind: 'music',
      speed: 8,
      loop: true,
      instruments: [],
      patterns: [],
      sequence: {
        ch1: [null],
        ch2: [null],
        ch4: [null]
      }
    })
  })

  it('parses and serializes music assets with engine-native patterns and sequences', () => {
    const document = parseProjectAssetDocument({
      kind: 'music',
      version: 1,
      speed: 6,
      loop: false,
      instruments: [
        { name: 'Lead', sweep: 0x13, reg1: 0x80, reg2: 0xf2, reg3: 0x20 },
        { name: 'Kick', reg1: 0x3f, reg2: 0xf1, reg3: 0x23 }
      ],
      patterns: [
        {
          id: 'intro',
          name: 'Intro',
          steps: [
            { noteIndex: 12, instrument: 1 },
            ...Array.from({ length: 15 }, () => ({ noteIndex: 0xff, instrument: 0 }))
          ]
        }
      ],
      sequence: {
        ch1: ['intro'],
        ch2: [null],
        ch4: ['intro']
      }
    }) as MusicAssetDocument

    expect(document.patterns[0].steps[0]).toEqual({ noteIndex: 12, instrument: 1 })
    expect(document.instruments[0]).toMatchObject({ sweep: 0x13 })
    expect(serializeProjectAssetDocument(document)).toContain('"kind": "music"')
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
        windowY: 200,
        windowTopEnd: 3,
        windowBottomStart: 1
      })
    ).toMatchObject({
      kind: 'window',
      tilesetPath: null,
      windowVisibilityBands: []
    })
  })

  it('rejects malformed sprite, tileset, tilemap, window, actor, music, and unsupported assets', () => {
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
    ).toThrow('The music asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'music',
        version: 1,
        speed: 6,
        loop: true,
        instruments: [{ reg1: 0x100, reg2: 0xf2, reg3: 0x20 }],
        patterns: [
          {
            id: 'bad',
            name: 'Bad',
            steps: Array.from({ length: 16 }, () => ({ noteIndex: 0xff, instrument: 0 }))
          }
        ],
        sequence: {
          ch1: ['bad'],
          ch2: [null],
          ch4: [null]
        }
      })
    ).toThrow('The music asset file is invalid.')

    expect(() =>
      parseProjectAssetDocument({
        kind: 'shader',
        version: 1
      })
    ).toThrow('The asset type is not supported.')
  })
})
