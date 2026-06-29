import { describe, expect, it, vi } from 'vitest'
import { ProjectLauncherError } from '../../src/main/projectLauncherPrimitives'
import type { ProjectAssetRecordLike } from '../../src/main/projectBuildCodeTypes'
import type { ProjectScriptRecordResolved } from '../../src/main/projectCodeScripts'
import {
  buildSceneInitializationLines,
  createNodeEmitter
} from '../../src/main/projectSceneCodeEmitter'

const asset = (
  kind: ProjectAssetRecordLike['kind'],
  identifier: string,
  document: unknown,
  bank = 2,
  path = identifier
): ProjectAssetRecordLike => ({
  kind,
  path,
  name: identifier,
  identifier,
  bank,
  document: document as ProjectAssetRecordLike['document']
})

const script = (path: string, identifier: string, bank = 3): ProjectScriptRecordResolved => ({
  kind: 'actor',
  path,
  name: identifier,
  identifier,
  bank
})

const actorNode = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'actor-1',
  type: 'actor',
  name: 'Hero',
  isCollapsed: false,
  spritePath: null,
  scriptPath: null,
  spritePaletteIndex: 0,
  x: 1,
  y: 2,
  physicsMode: 'balanced',
  followCamera: false,
  tags: [],
  children: [],
  ...overrides
})

const collisionNode = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'collision-1',
  type: 'collision',
  name: 'Hitbox',
  isCollapsed: false,
  x: 3,
  y: 4,
  width: 5,
  height: 6,
  isBlocking: true,
  tags: [],
  callbacks: [],
  exitCallbacks: [],
  children: [],
  ...overrides
})

const sceneDocument = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'scene',
  version: 1,
  tilemapPath: null,
  windowPath: null,
  spritePalettes: undefined,
  spritePalette: undefined,
  backgroundPalette: undefined,
  scriptPath: null,
  nodes: [],
  ...overrides
})

describe('projectSceneCodeEmitter', () => {
  it('emits folders, scripted actors, nested actors, collisions, tags, palettes, and callbacks', () => {
    const spriteAssets = new Map([
      [
        'hero.rgbsprite.json',
        asset(
          'sprite',
          'HeroSprite',
          {
            kind: 'sprite',
            width: 16,
            height: 16,
            palette: ['#ffffff', '#aaaaaa', '#555555', '#000000']
          },
          2,
          'hero.rgbsprite.json'
        )
      ]
    ])
    const scripts = new Map([['hero.c', script('hero.c', 'HeroActor')]])
    const callbacks = new Map([['collision.c', script('collision.c', 'CollisionScript', 5)]])
    const emitNode = createNodeEmitter(
      spriteAssets,
      scripts,
      [
        { id: 'solid', name: 'Solid' },
        { id: 'danger', name: 'Danger Zone' }
      ],
      1,
      callbacks
    )
    const lines: string[] = []
    const emitted = emitNode(
      {
        id: 'folder',
        type: 'folder',
        name: 'Group',
        isCollapsed: false,
        children: [
          actorNode({
            spritePath: 'hero.rgbsprite.json',
            scriptPath: 'hero.c',
            spritePaletteIndex: 1,
            x: 4,
            y: 5,
            physicsMode: 'highFidelity',
            followCamera: true,
            cameraDeadzone: {
              left: 8,
              right: 24,
              top: 12,
              bottom: 28
            },
            tags: ['solid', 'danger'],
            children: [
              actorNode({ id: 'child', name: 'Child', physicsMode: 'highPerf', x: 1, y: 1 }),
              collisionNode({
                tags: ['solid', 'danger'],
                callbacks: [{ scriptPath: 'collision.c', functionName: 'OnHit' }],
                exitCallbacks: [{ scriptPath: 'collision.c', functionName: 'OnExit' }]
              })
            ]
          })
        ]
      } as never,
      null,
      lines,
      { actor: 0 }
    )

    expect(emitted).toBeNull()
    expect(lines.join('\n')).toContain('Actor* generated_actor_0 = create_actor(_HeroActor);')
    expect(lines.join('\n')).toContain('generated_actor_0->physics_mode = HIGH_FIDELITY;')
    expect(lines.join('\n')).toContain('set_actor_position(260, 389);')
    expect(lines.join('\n')).toContain('set_animation_props(S_PALETTE, 16, 24);')
    expect(lines.join('\n')).toContain('deadzone_left = 8;')
    expect(lines.join('\n')).toContain('deadzone_right = 24;')
    expect(lines.join('\n')).toContain('deadzone_top = 12;')
    expect(lines.join('\n')).toContain('deadzone_bottom = 28;')
    expect(lines.join('\n')).toContain('generated_actor_0->followed = 1;')
    expect(lines.join('\n')).toContain('set_tag(TAG_SOLID, 0);')
    expect(lines.join('\n')).not.toContain('set_tag(TAG_DANGER_ZONE, 1);')
    expect(lines.join('\n')).toContain('attach_child(generated_actor_1);')
    expect(lines.join('\n')).toContain('generated_actor_2_collider->tags[0] = TAG_SOLID;')
    expect(lines.join('\n')).toContain('TO_FAR_PTR(OnHit, BANK(CollisionScript_bankref))')
    expect(lines.join('\n')).toContain('TO_FAR_PTR(OnExit, BANK(CollisionScript_bankref))')
  })

  it('emits standalone colliders and reports missing references', () => {
    const emitNode = createNodeEmitter(new Map(), new Map(), [], 5, new Map())
    const lines: string[] = []
    const actorVariable = emitNode(collisionNode() as never, null, lines, { actor: 0 })
    expect(actorVariable).toBe('generated_actor_0')
    expect(lines.join('\n')).toContain(
      'Actor* generated_actor_0 = create_actor(_GeneratedDefaultActor);'
    )
    expect(lines.join('\n')).toContain('set_actor_position(3, 4);')

    expect(() =>
      emitNode(actorNode({ spritePath: 'missing.rgbsprite.json' }) as never, null, [], { actor: 0 })
    ).toThrow('Actor "Hero" references a missing sprite resource: missing.rgbsprite.json')

    const callbackEmitter = createNodeEmitter(new Map(), new Map(), [], 5, new Map())
    expect(() =>
      callbackEmitter(
        collisionNode({ callbacks: [{ scriptPath: 'missing.c', functionName: 'OnHit' }] }) as never,
        null,
        [],
        { actor: 0 }
      )
    ).toThrow('Collision callback "OnHit" references a missing script resource: missing.c')
  })

  it('builds scene initialization lines and reports missing tilemap/window resources', () => {
    const tilemap = asset(
      'tilemap',
      'ForestMap',
      { kind: 'tilemap', tilesetPath: 'tileset', width: 2, height: 2, grid: [0, 1, 2, 3] },
      2,
      'map'
    )
    const windowResource = asset(
      'window',
      'DialogWindow',
      {
        kind: 'window',
        tilesetPath: 'tileset',
        width: 2,
        height: 2,
        grid: [0, 1, 2, 3],
        windowVisibilityBands: [{ start: 0, end: 144 }]
      },
      2,
      'window'
    )
    const tileset = asset(
      'tileset',
      'ForestTiles',
      {
        kind: 'tileset',
        palette: ['#ffffff', '#aaaaaa', '#555555', '#000000'],
        tiles: []
      },
      2,
      'tileset'
    )
    const sprite = asset(
      'sprite',
      'HeroSprite',
      {
        kind: 'sprite',
        width: 8,
        height: 8,
        palette: ['#000000', '#555555', '#aaaaaa', '#ffffff']
      },
      2,
      'hero'
    )
    const emitNode = vi.fn((node, _parentActor, lines: string[]) => {
      lines.push(`    emitted ${node.name};`)
      return null
    })
    const lines = buildSceneInitializationLines(
      asset(
        'scene',
        'Intro',
        sceneDocument({
          tilemapPath: 'map',
          windowPath: 'window',
          nodes: [actorNode({ name: 'Hero', spritePath: 'hero' })]
        }),
        2,
        'scene'
      ),
      new Map([['map', tilemap]]),
      new Map([['window', windowResource]]),
      emitNode,
      new Map([['hero', sprite]]),
      new Map([['tileset', tileset]])
    )

    expect(lines).toEqual(
      expect.arrayContaining([
        '    BGP_REG = 0xE4;',
        '    OBP0_REG = 0x1B;',
        '    OBP1_REG = 0x1B;',
        '    set_scene_map(maps[ForestMap]);',
        '    set_scene_window(maps[DialogWindow]);',
        '    emitted Hero;'
      ])
    )
    expect(emitNode).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hero' }), null, lines, {
      actor: 0
    })

    expect(() =>
      buildSceneInitializationLines(
        asset('scene', 'Broken', sceneDocument({ tilemapPath: 'missing' })),
        new Map(),
        new Map(),
        vi.fn()
      )
    ).toThrow(ProjectLauncherError)

    expect(() =>
      buildSceneInitializationLines(
        asset('scene', 'Broken', sceneDocument({ windowPath: 'missing' })),
        new Map(),
        new Map(),
        vi.fn()
      )
    ).toThrow('Scene "Broken" references a missing window resource: missing')
  })

  it('emits window visibility bands for non-full windows', () => {
    const lines = buildSceneInitializationLines(
      asset(
        'scene',
        'BandScene',
        sceneDocument({
          windowPath: 'window'
        })
      ),
      new Map(),
      new Map([
        [
          'window',
          asset(
            'window',
            'DialogWindow',
            {
              kind: 'window',
              tilesetPath: null,
              width: 20,
              height: 18,
              grid: new Array(20 * 18).fill(0),
              windowVisibilityBands: [
                { start: 0, end: 32 },
                { start: 80, end: 144 }
              ]
            },
            2,
            'window'
          )
        ]
      ]),
      vi.fn()
    )

    expect(lines).toEqual(
      expect.arrayContaining([
        '    set_scene_window(maps[DialogWindow]);',
        '    window_visibility_clear_owner(WINDOW_VISIBILITY_OWNER_SCENE);',
        '    window_visibility_add_band(WINDOW_VISIBILITY_OWNER_SCENE, 0, 32);',
        '    window_visibility_add_band(WINDOW_VISIBILITY_OWNER_SCENE, 80, 144);',
        '    window_visibility_apply();'
      ])
    )
  })

  it('uses configured sprite palette fallbacks before discovered sprite palettes', () => {
    const lines = buildSceneInitializationLines(
      asset(
        'scene',
        'PaletteScene',
        sceneDocument({
          spritePalettes: [null, ['#ffffff', '#aaaaaa', '#555555', '#000000']],
          backgroundPalette: ['#000000', '#555555', '#aaaaaa', '#ffffff']
        })
      ),
      new Map(),
      new Map(),
      vi.fn()
    )

    expect(lines).toEqual(['    BGP_REG = 0x1B;', '    OBP1_REG = 0xE4;'])
  })
})
