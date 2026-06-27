import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../../src/shared/projectResourceModels'
import { ProjectLauncherError } from '../../src/main/projectLauncher'
import type { ProjectAssetRecordLike } from '../../src/main/projectBuildCodeTypes'
import {
  buildActorRegistryHeader,
  buildAnimationRegistryFiles,
  buildMapRegistryFiles,
  buildMapResourceFiles,
  buildMusicResourceFiles,
  buildSceneRegistryHeader,
  buildSongRegistryFiles,
  buildSpriteResourceFiles,
  buildTilesetResourceFiles,
  canReuseSharedTilesetForMap
} from '../../src/main/projectCCodeEmitters'

const asset = (
  kind: ProjectAssetRecordLike['kind'],
  identifier: string,
  document: unknown,
  bank = 2
): ProjectAssetRecordLike => ({
  kind,
  path: `${identifier}.json`,
  name: identifier,
  identifier,
  bank,
  document: document as ProjectAssetRecordLike['document']
})

const spriteDocument = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'sprite',
  version: 1,
  width: 8,
  height: 8,
  is8x16Mode: false,
  fps: 12,
  palette: ['#ffffff', '#aaaaaa', '#555555', '#000000'],
  frames: [[1, ...new Array(63).fill(0)]],
  ...overrides
})

const tilesetDocument = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'tileset',
  version: 1,
  palette: ['#ffffff', '#aaaaaa', '#555555', '#000000'],
  tiles: [[1, ...new Array(63).fill(0)]],
  ...overrides
})

const tilemapDocument = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'tilemap',
  version: 1,
  width: 2,
  height: 2,
  tilesetPath: 'tileset',
  grid: [0, 1, 2, 3],
  ...overrides
})

const musicDocument = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'music',
  version: 1,
  speed: 6,
  instruments: [{ reg1: 1, reg2: 2, reg3: 3 }],
  patterns: [
    {
      id: 'intro',
      steps: [
        { noteIndex: 12, instrument: 0 },
        { noteIndex: 0xff, instrument: 0 }
      ]
    }
  ],
  sequence: {
    ch1: ['intro'],
    ch2: [null],
    ch4: [undefined]
  },
  ...overrides
})

describe('projectCCodeEmitters', () => {
  it('builds sprite files for single sprites and metasprites', () => {
    const single = buildSpriteResourceFiles(asset('sprite', 'Hero', spriteDocument()))
    expect(single.headerPath).toBe('res/Hero/Hero.h')
    expect(single.headerContent).not.toContain('metasprite_t')
    expect(single.sourceContent).toContain('#pragma bank 2')
    expect(single.sourceContent).toContain('0x80,0x00')

    const metasprite = buildSpriteResourceFiles(
      asset(
        'sprite',
        'BigHero',
        spriteDocument({
          width: 16,
          height: 16,
          is8x16Mode: true,
          fps: 7,
          frames: [[...new Array(64).fill(0), ...new Array(64).fill(1), ...new Array(128).fill(0)]]
        })
      )
    )
    expect(metasprite.headerContent).toContain('#include <gb/metasprites.h>')
    expect(metasprite.sourceContent).toContain('const metasprite_t BigHero_metasprite_data[]')
    expect(metasprite.sourceContent).toContain('METASPR_TERM')

    const globally8x16 = buildSpriteResourceFiles(
      asset('sprite', 'GlobalHero', spriteDocument()),
      true
    )
    expect(globally8x16.headerContent).not.toContain('metasprite_t')
    expect(globally8x16.sourceContent).toContain(
      '0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00'
    )
  })

  it('builds tileset and map files with embedded or shared tilesets', () => {
    const tileset = asset('tileset', 'ForestTiles', tilesetDocument(), 4)
    const tilesetFiles = buildTilesetResourceFiles(tileset)
    expect(tilesetFiles.headerContent).toContain('#define ForestTiles_num_tiles 1')
    expect(tilesetFiles.sourceContent).toContain('BANKREF(ForestTiles_bankref)')

    const tilemap = asset('tilemap', 'ForestMap', tilemapDocument(), 4)
    const sharedMap = buildMapResourceFiles(tilemap, tileset, 0, 0, true)
    expect(sharedMap.headerContent).toContain('#include "ForestTiles/ForestTiles.h"')
    expect(sharedMap.headerContent).toContain('#define ForestMap_tileset ForestTiles_tileset')
    expect(sharedMap.sourceContent).not.toContain('ForestMap_tileset[]')

    const windowResource = asset(
      'window',
      'DialogWindow',
      {
        kind: 'window',
        version: 1,
        width: 2,
        height: 4,
        tilesetPath: 'tileset',
        windowVisibilityBands: [
          { start: 8, end: 16 },
          { start: 24, end: 32 }
        ],
        grid: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      5
    )
    const windowFiles = buildMapResourceFiles(windowResource, tileset, 0, 0, false, [
      { start: 8, end: 16 },
      { start: 24, end: 32 }
    ])
    expect(windowFiles.headerContent).toContain('extern const uint8_t DialogWindow_tileset[];')
    expect(windowFiles.sourceContent).toContain('0x02,0x03,0x06,0x07')
    expect(windowFiles.sourceContent).toContain('/* window visibility bands: 8-16,24-32 */')
  })

  it('decides when a map can reuse a shared tileset', () => {
    const tileset = asset('tileset', 'Tiles', tilesetDocument(), 3)
    expect(
      canReuseSharedTilesetForMap(asset('tilemap', 'MapA', tilemapDocument(), 3), tileset)
    ).toBe(true)
    expect(
      canReuseSharedTilesetForMap(
        asset('tilemap', 'MapB', tilemapDocument(), DEFAULT_PROJECT_RESOURCE_BANK),
        asset('tileset', 'Tiles', tilesetDocument(), DEFAULT_PROJECT_RESOURCE_BANK)
      )
    ).toBe(false)
    expect(
      canReuseSharedTilesetForMap(asset('tilemap', 'MapC', tilemapDocument(), 4), tileset)
    ).toBe(false)
  })

  it('builds music files and validates malformed music documents', () => {
    const music = asset('music', 'Theme', musicDocument(), 6)
    const files = buildMusicResourceFiles(music)
    expect(files.headerContent).toContain('extern const Instrument Theme_instruments[];')
    expect(files.sourceContent).toContain('{ .note_index = 0x0C, .instrument = 0x00 }')
    expect(files.sourceContent).toContain('(void*) 0')

    const silent = buildMusicResourceFiles(
      asset(
        'music',
        'Silent',
        musicDocument({
          instruments: [],
          patterns: [{ id: 'rest', steps: [{ noteIndex: 0xff, instrument: 0 }] }],
          sequence: { ch1: ['rest'], ch2: ['rest'], ch4: ['rest'] }
        })
      )
    )
    expect(silent.sourceContent).toContain(
      '{ .sweep = 0x00, .reg1 = 0x00, .reg2 = 0x00, .reg3 = 0x00 },'
    )

    const invalidDocuments = [
      { kind: 'sprite' },
      musicDocument({ speed: 0 }),
      musicDocument({ instruments: [{ sweep: 0x100, reg1: 1, reg2: 2, reg3: 3 }] }),
      musicDocument({ instruments: [{ reg1: -1, reg2: 2, reg3: 3 }] }),
      musicDocument({
        patterns: [
          { id: 'dup', steps: [] },
          { id: 'dup', steps: [] }
        ]
      }),
      musicDocument({ patterns: [{ id: 'bad-note', steps: [{ noteIndex: 72, instrument: 0 }] }] }),
      musicDocument({ patterns: [{ id: 'bad-inst', steps: [{ noteIndex: 1, instrument: 9 }] }] }),
      musicDocument({ sequence: { ch1: ['missing'], ch2: [], ch4: [] } }),
      musicDocument({ sequence: { ch1: [], ch2: [], ch4: [] } }),
      musicDocument({ sequence: { ch1: new Array(256).fill(null), ch2: [], ch4: [] } })
    ]

    for (const document of invalidDocuments) {
      expect(() => buildMusicResourceFiles(asset('music', 'Broken', document))).toThrow(
        ProjectLauncherError
      )
    }
  })

  it('builds empty and populated music registries', () => {
    const empty = buildSongRegistryFiles([])
    expect(empty.headerContent).toContain('NUMBER_OF_SONGS = 1')
    expect(empty.sourceContent).toContain('(void*) 0')

    const populated = buildSongRegistryFiles([asset('music', 'Theme', musicDocument(), 6)])
    expect(populated.headerContent).toContain('Theme,')
    expect(populated.sourceContent).toContain('BANKREF_EXTERN(Theme_bankref)')
    expect(populated.sourceContent).toContain('[Theme] = &_Theme')
  })

  it('builds animation registries for empty and populated sprites', () => {
    const empty = buildAnimationRegistryFiles([])
    expect(empty.headerContent).toContain('NUMBER_OF_ANIMATIONS = 1')
    expect(empty.headerContent).toContain('#define SPRITES_8X16_ENABLED 0')
    expect(empty.sourceContent).toContain('{0, (void*) 0}')

    const populated = buildAnimationRegistryFiles([
      asset('sprite', 'Hero', spriteDocument()),
      asset('sprite', 'BigHero', spriteDocument({ width: 16, height: 8 }))
    ])
    expect(populated.headerContent).toContain('#include "Hero/Hero.h"')
    expect(populated.headerContent).toContain('#define SPRITES_8X16_ENABLED 0')
    expect(populated.sourceContent).toContain('.metasprite = (void*) 0')
    expect(populated.sourceContent).toContain('.metasprite = BigHero_metasprite_data')
    expect(populated.sourceContent).toContain(
      '[BigHero] = {BANK(BigHero_bankref), BigHero_sprite_data}'
    )

    const globally8x16 = buildAnimationRegistryFiles([
      asset('sprite', 'TinyHero', spriteDocument()),
      asset('sprite', 'TallHero', spriteDocument({ height: 16, is8x16Mode: true }))
    ])
    expect(globally8x16.headerContent).toContain('#define SPRITES_8X16_ENABLED 1')
    expect(globally8x16.sourceContent).toContain('.metasprite = (void*) 0')
  })

  it('builds map registries and reports missing tilesets', () => {
    const tileset = asset('tileset', 'Tiles', tilesetDocument(), 8)
    const empty = buildMapRegistryFiles([], [], new Map())
    expect(empty.headerContent).toContain('NUMBER_OF_MAPS = 1')
    expect(empty.sourceContent).toContain('{0, (void*) 0}')

    const populated = buildMapRegistryFiles(
      [asset('tilemap', 'MapA', tilemapDocument(), 8)],
      [
        asset(
          'window',
          'WindowA',
          {
            kind: 'window',
            version: 1,
            width: 2,
            height: 4,
            tilesetPath: 'tileset',
            windowVisibilityBands: [
              { start: 8, end: 16 },
              { start: 24, end: 32 }
            ],
            grid: [0, 1, 2, 3, 4, 5, 6, 7]
          },
          9
        )
      ],
      new Map([['tileset', tileset]])
    )
    expect(populated.headerContent).toContain('#include "MapA/MapA.h"')
    expect(populated.sourceContent).toContain('.tileset = Tiles_tileset')
    expect(populated.sourceContent).toContain('.tileset = WindowA_tileset')
    expect(populated.sourceContent).not.toContain('.window_y')
    expect(populated.sourceContent).toContain('.window_top_end = 0')
    expect(populated.sourceContent).toContain('.window_bottom_start = 0')

    expect(() =>
      buildMapRegistryFiles(
        [asset('tilemap', 'Missing', tilemapDocument({ tilesetPath: null }))],
        [],
        new Map()
      )
    ).toThrow('Map "Missing" references a missing tileset resource: none')
  })

  it('builds actor and scene registry headers', () => {
    const actorHeader = buildActorRegistryHeader(
      [
        {
          kind: 'actor',
          path: 'src/CustomActors/Hero.c',
          name: 'Hero',
          identifier: 'Hero',
          bank: 2
        }
      ],
      [{ id: 'solid', name: 'Solid Block' }]
    )
    expect(actorHeader).toContain('_ACTOR(GeneratedDefaultActor)')
    expect(actorHeader).toContain('_ACTOR(Hero)')
    expect(actorHeader).toContain('TAG_SOLID_BLOCK')

    expect(buildSceneRegistryHeader([])).toContain('_SCENE(SampleScene)')
    const sceneHeader = buildSceneRegistryHeader(['Intro', 'Intro', 'Ending'])
    expect(sceneHeader.match(/_SCENE\(Intro\)/g)).toHaveLength(1)
    expect(sceneHeader).toContain('_SCENE(Ending)')
  })
})
