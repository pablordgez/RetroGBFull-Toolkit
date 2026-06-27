import { ProjectLauncherError } from './projectLauncher'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import { MANAGED_DEFAULT_ACTOR_IDENTIFIER } from './projectSceneCodeEmitter'
import type { ProjectScriptRecordResolved } from './projectCodeScripts'
import type { ProjectAssetRecordLike } from './projectBuildCodeTypes'
import { buildProjectTagEnumName, type ProjectTagEntry } from '../shared/projectTags'
import {
  normalizeLegacyWindowVisibilityBands,
  normalizeWindowVisibilityTileBands,
  WINDOW_VISIBILITY_SCREEN_HEIGHT,
  type WindowVisibilityBand,
  type WindowAssetDocument
} from '../shared/projectAssets'
import type {
  MusicAssetDocument,
  MusicChannelKey,
  MusicPattern,
  SpriteAssetDocument,
  TilemapAssetDocument,
  TilesetAssetDocument
} from '../shared/projectAssets'

const formatHexByte = (value: number): string => {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
}

// formats an array of numbers (up to 255) to a string of hex bytes, with a given number of values per line
const formatByteArray = (values: number[], valuesPerLine = 16): string => {
  if (values.length === 0) {
    return ''
  }

  const lines: string[] = []

  for (let index = 0; index < values.length; index += valuesPerLine) {
    lines.push(
      values
        .slice(index, index + valuesPerLine)
        .map(formatHexByte)
        .join(',')
    )
  }

  return `${lines.join(',\n')}\n`
}

// GBDK tile format: for each row, the first byte contains the least significant bit of each pixel
// the second byte contains the most significant bit of each pixel
const buildTileBytes = (pixels: number[]): number[] => {
  const bytes: number[] = []

  for (let row = 0; row < 8; row += 1) {
    let lowByte = 0
    let highByte = 0

    for (let column = 0; column < 8; column += 1) {
      const color = pixels[row * 8 + column] ?? 0
      const bitShift = 7 - column
      lowByte |= (color & 1) << bitShift
      highByte |= ((color >> 1) & 1) << bitShift
    }

    bytes.push(lowByte, highByte)
  }

  return bytes
}

// builds a sprite byte array: for each frame, split by rows of 8x8 tiles (in 8x16 mode for each tile, the tile in
// the following row is also included), for each tile build the tile bytes and concatenate them
const buildSpriteFrameBytes = (
  document: SpriteAssetDocument,
  use8x16SpriteMode = document.is8x16Mode
): number[] => {
  const bytes: number[] = []
  // width is document width in 8 pixel tiles
  const tilesAcross = Math.max(1, Math.ceil(document.width / 8))
  // height depends on mode
  const tilesDown = use8x16SpriteMode
    ? Math.max(1, Math.ceil(document.height / 16))
    : Math.max(1, Math.ceil(document.height / 8))

  for (const frame of document.frames) {
    // for each row
    for (let tileY = 0; tileY < tilesDown; tileY += 1) {
      // for each column
      for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
        // builds an array with the rows that the tile(s) occupy: in 8x16 mode it's the current tile and
        // the one in the next row, in 8x8 mode, just the current tile
        const tileRows = use8x16SpriteMode ? [tileY * 16, tileY * 16 + 8] : [tileY * 8]

        for (const startRow of tileRows) {
          const pixels: number[] = []
          // for each tile, build an array with its pixels
          for (let row = 0; row < 8; row += 1) {
            for (let column = 0; column < 8; column += 1) {
              const pixelIndex = (startRow + row) * document.width + (tileX * 8 + column)
              pixels.push(frame[pixelIndex] ?? 0)
            }
          }
          // then build the tile
          bytes.push(...buildTileBytes(pixels))
        }
      }
    }
  }

  return bytes
}

const buildTilesetBytes = (document: TilesetAssetDocument): number[] => {
  return document.tiles.flatMap((tile) => buildTileBytes(tile))
}

interface SpriteMetaspriteLayoutEntry {
  x: number
  y: number
  dtile: number
}

const hasSpriteMetaspriteLayout = (
  document: SpriteAssetDocument,
  use8x16SpriteMode = document.is8x16Mode
): boolean => {
  const maxSingleSpriteHeight = use8x16SpriteMode ? 16 : 8
  return document.width > 8 || document.height > maxSingleSpriteHeight
}

const isSpriteTileBlank = (
  frame: number[],
  width: number,
  height: number,
  startX: number,
  startY: number
): boolean => {
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const pixelX = startX + column
      const pixelY = startY + row

      if (pixelX >= width || pixelY >= height) {
        continue
      }

      if ((frame[pixelY * width + pixelX] ?? 0) !== 0) {
        return false
      }
    }
  }

  return true
}

// build entries with x, y and dtile for each sprite in a metasprite
const collectSpriteMetaspriteEntries = (
  document: SpriteAssetDocument,
  use8x16SpriteMode = document.is8x16Mode
): SpriteMetaspriteLayoutEntry[] => {
  const tilesAcross = Math.max(1, Math.ceil(document.width / 8))

  // different logic for 8x16 mode
  if (use8x16SpriteMode) {
    const spriteRows = Math.max(1, Math.ceil(document.height / 16))
    const entries: SpriteMetaspriteLayoutEntry[] = []

    for (let spriteRow = 0; spriteRow < spriteRows; spriteRow += 1) {
      for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
        // startX and startY are the coordinates of the upper tile
        const startX = tileX * 8
        const startY = spriteRow * 16
        // check if both the upper and lower tile are blank across all frames, if so, skip adding an entry
        // across all frames because metasprite entries are shared across frames (so to change the frame
        // the engine only has to change the start tile)
        const upperBlank = document.frames.every((frame) =>
          isSpriteTileBlank(frame, document.width, document.height, startX, startY)
        )
        const lowerBlank = document.frames.every((frame) =>
          isSpriteTileBlank(frame, document.width, document.height, startX, startY + 8)
        )

        if (upperBlank && lowerBlank) {
          continue
        }

        // build an entry
        // dtile is the index of the tile in the sprite data
        // in 8x16 mode, every other tile points to the first tile of the 8x16 block, so for each entry we need
        // to skip it, hence the *2
        entries.push({
          x: startX,
          y: startY,
          dtile: (spriteRow * tilesAcross + tileX) * 2
        })
      }
    }

    return entries
  }

  const tilesDown = Math.max(1, Math.ceil(document.height / 8))
  const entries: SpriteMetaspriteLayoutEntry[] = []

  for (let tileY = 0; tileY < tilesDown; tileY += 1) {
    for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
      const startX = tileX * 8
      const startY = tileY * 8
      // in 8x8 mode we just need to check if the one tile is blank
      if (
        document.frames.every((frame) =>
          isSpriteTileBlank(frame, document.width, document.height, startX, startY)
        )
      ) {
        continue
      }
      // then build an entry without skipping anything
      entries.push({
        x: startX,
        y: startY,
        dtile: tileY * tilesAcross + tileX
      })
    }
  }

  return entries
}

// build metasprite data
const buildMetaspriteLines = (
  identifier: string,
  document: SpriteAssetDocument,
  use8x16SpriteMode = document.is8x16Mode
): string[] => {
  const tilesAcross = Math.max(1, Math.ceil(document.width / 8))
  const tilesDown = use8x16SpriteMode
    ? Math.max(1, Math.ceil(document.height / 16))
    : Math.max(1, Math.ceil(document.height / 8))

  if (tilesAcross === 1 && tilesDown === 1) {
    return []
  }

  const lines: string[] = [`const metasprite_t ${identifier}_metasprite_data[] = {`]
  const entries = collectSpriteMetaspriteEntries(document, use8x16SpriteMode)
  // pivot starts at the center
  let previousX = document.width / 2
  let previousY = document.height / 2

  for (const entry of entries) {
    const deltaX = entry.x - previousX
    const deltaY = entry.y - previousY

    lines.push(`{ .dy=${deltaY}, .dx=${deltaX}, .dtile=${entry.dtile}, .props=0 },`)
    // move pivot to the current tile
    previousX = entry.x
    previousY = entry.y
  }

  // push terminator
  lines.push('METASPR_TERM')
  lines.push('};')
  return lines
}

const buildAnimationDuration = (fps: number): number => {
  return Math.max(1, Math.round(60 / Math.max(1, fps)))
}

// builds the header and source files for a sprite
export const buildSpriteResourceFiles = (
  sprite: ProjectAssetRecordLike,
  use8x16SpriteMode = (sprite.document as SpriteAssetDocument).is8x16Mode
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = sprite.document as SpriteAssetDocument
  const hasMetasprite = hasSpriteMetaspriteLayout(document, use8x16SpriteMode)
  const metaspriteLines = hasMetasprite
    ? buildMetaspriteLines(sprite.identifier, document, use8x16SpriteMode)
    : []
  const resourceDirectory = `res/${sprite.identifier}`
  const headerPath = `${resourceDirectory}/${sprite.identifier}.h`
  const sourcePath = `${resourceDirectory}/${sprite.identifier}.c`
  // header:
  // avoid redefinitions
  // include GBDK and stdint
  // include metasprites if needed
  // declare the sprite data array
  // declare the metasprite data array if needed
  const headerLines = [
    `#ifndef ${sprite.identifier.toUpperCase()}_H`,
    `#define ${sprite.identifier.toUpperCase()}_H`,
    '#include <stdint.h>',
    '#include <gb/gb.h>',
    ...(hasMetasprite ? ['#include <gb/metasprites.h>'] : []),
    '',
    `extern const uint8_t ${sprite.identifier}_sprite_data[];`,
    ...(hasMetasprite ? [`extern const metasprite_t ${sprite.identifier}_metasprite_data[];`] : []),
    '',
    `#endif /* ${sprite.identifier.toUpperCase()}_H */`,
    ''
  ]
  // source:
  // set the bank
  // include the header
  // define the bank ref
  // define the sprite data array with the formatted byte array
  // define the metasprite data array if needed
  const sourceLines = [
    `#pragma bank ${sprite.bank}`,
    `#include "${sprite.identifier}.h"`,
    '',
    `BANKREF(${sprite.identifier}_bankref)`,
    '',
    `const uint8_t ${sprite.identifier}_sprite_data[] = {`,
    formatByteArray(buildSpriteFrameBytes(document, use8x16SpriteMode)),
    '};',
    ...(metaspriteLines.length > 0 ? ['', ...metaspriteLines] : []),
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

// builds the header and source files for a tileset
export const buildTilesetResourceFiles = (
  tileset: ProjectAssetRecordLike
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = tileset.document as TilesetAssetDocument
  const resourceDirectory = `res/${tileset.identifier}`
  const headerPath = `${resourceDirectory}/${tileset.identifier}.h`
  const sourcePath = `${resourceDirectory}/${tileset.identifier}.c`
  // header:
  // avoid redefinitions
  // include GBDK and stdint
  // declare the tileset data array
  // define the number of tiles constant
  const headerLines = [
    `#ifndef ${tileset.identifier.toUpperCase()}_H`,
    `#define ${tileset.identifier.toUpperCase()}_H`,
    '#include <gb/gb.h>',
    '',
    `extern const uint8_t ${tileset.identifier}_tileset[];`,
    `#define ${tileset.identifier}_num_tiles ${document.tiles.length}`,
    '',
    `#endif /* ${tileset.identifier.toUpperCase()}_H */`,
    ''
  ]
  // source:
  // set the bank
  // include the header
  // define the bank ref
  // define the tileset data array with the formatted byte array

  const sourceLines = [
    `#pragma bank ${tileset.bank}`,
    `#include "${tileset.identifier}.h"`,
    '',
    `BANKREF(${tileset.identifier}_bankref)`,
    '',
    `const uint8_t ${tileset.identifier}_tileset[] = {`,
    formatByteArray(buildTilesetBytes(document)),
    '};',
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

// builds the header and source files for a tilemap or window
export const buildMapResourceFiles = (
  resource: ProjectAssetRecordLike,
  tileset: ProjectAssetRecordLike,
  windowTopEnd: number,
  windowBottomStart: number,
  usesSharedTileset: boolean,
  windowVisibilityBands?: WindowVisibilityBand[]
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = resource.document as TilemapAssetDocument | WindowAssetDocument
  const tilesetDocument = tileset.document as TilesetAssetDocument
  const visibilityBands =
    document.kind === 'window'
      ? (windowVisibilityBands ??
        normalizeLegacyWindowVisibilityBands(windowTopEnd, windowBottomStart, document.height))
      : []
  const runtimeGrid = buildRuntimeMapGrid(document, visibilityBands)
  const resourceDirectory = `res/${resource.identifier}`
  const headerPath = `${resourceDirectory}/${resource.identifier}.h`
  const sourcePath = `${resourceDirectory}/${resource.identifier}.c`
  const tilesetHeaderInclude = `#include "${tileset.identifier}/${tileset.identifier}.h"`
  // header:
  // avoid redefinitions
  // include GBDK and stdint
  // include the tileset header if using a shared tileset
  // declare the map data array
  // if using a shared tileset, define the tileset and num_tiles as the ones from the shared tileset
  // otherwise, declare the tileset array and define num_tiles
  const headerLines = [
    `#ifndef ${resource.identifier.toUpperCase()}_H`,
    `#define ${resource.identifier.toUpperCase()}_H`,
    '#include <gb/gb.h>',
    ...(usesSharedTileset ? [tilesetHeaderInclude] : []),
    '',
    `extern const uint8_t ${resource.identifier}_map_data[];`,
    ...(usesSharedTileset
      ? [
          `#define ${resource.identifier}_tileset ${tileset.identifier}_tileset`,
          `#define ${resource.identifier}_num_tiles ${tileset.identifier}_num_tiles`
        ]
      : [
          `extern const uint8_t ${resource.identifier}_tileset[];`,
          `#define ${resource.identifier}_num_tiles ${tilesetDocument.tiles.length}`
        ]),
    '',
    `#endif /* ${resource.identifier.toUpperCase()}_H */`,
    ''
  ]
  // source:
  // set the bank
  // include the header
  // define the bank ref
  // define the map data array with the formatted byte array
  // define the tileset data array with the formatted byte array if not using a shared tileset
  // add a comment with the window split if it's a window resource
  const sourceLines = [
    `#pragma bank ${resource.bank}`,
    `#include "${resource.identifier}.h"`,
    '',
    `BANKREF(${resource.identifier}_bankref)`,
    '',
    `const uint8_t ${resource.identifier}_map_data[] = {`,
    formatByteArray(runtimeGrid.grid),
    '};',
    ...(!usesSharedTileset
      ? [
          '',
          `const uint8_t ${resource.identifier}_tileset[] = {`,
          formatByteArray(buildTilesetBytes(tilesetDocument)),
          '};'
        ]
      : []),
    '',
    `/* window visibility bands: ${visibilityBands.map((band) => `${band.start}-${band.end}`).join(',') || 'none'} */`,
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

const buildRuntimeMapGrid = (
  document: TilemapAssetDocument | WindowAssetDocument,
  windowVisibilityBands: WindowVisibilityBand[] = []
): { grid: number[]; height: number } => {
  if (document.kind !== 'window') {
    return {
      grid: document.grid,
      height: document.height
    }
  }

  const visibilityBands = normalizeWindowVisibilityTileBands(windowVisibilityBands)
  const width = Math.max(1, document.width)
  const rows: number[] = []
  let visibleLineCount = 0

  for (const band of visibilityBands) {
    const end = Math.min(WINDOW_VISIBILITY_SCREEN_HEIGHT, band.end)

    for (let line = band.start; line < end; line += 1) {
      if (visibleLineCount % 8 === 0) {
        const row = Math.floor(line / 8)
        rows.push(...document.grid.slice(row * width, (row + 1) * width))
      }
      visibleLineCount += 1
    }
  }

  return {
    grid: rows,
    height: Math.ceil(visibleLineCount / 8)
  }
}

// can reuse a tileset if it's in the same bank (and not autobanked as it's unreliable)
export const canReuseSharedTilesetForMap = (
  map: ProjectAssetRecordLike,
  tileset: ProjectAssetRecordLike
): boolean => {
  return map.bank !== DEFAULT_PROJECT_RESOURCE_BANK && map.bank === tileset.bank
}

const MUSIC_CHANNELS: MusicChannelKey[] = ['ch1', 'ch2', 'ch4']

const formatMusicStep = (noteIndex: number, instrument: number): string => {
  return `{ .note_index = ${formatHexByte(noteIndex)}, .instrument = ${formatHexByte(instrument)} }`
}

const assertValidMusicDocument = (music: ProjectAssetRecordLike): MusicAssetDocument => {
  const document = music.document as MusicAssetDocument

  if (document.kind !== 'music') {
    throw new ProjectLauncherError(`Music "${music.name}" has an invalid asset document.`)
  }

  if (!Number.isInteger(document.speed) || document.speed < 1 || document.speed > 255) {
    throw new ProjectLauncherError(`Music "${music.name}" has an invalid speed.`)
  }

  if (
    document.instruments.length > 256 ||
    document.instruments.some(
      (instrument) =>
        (instrument.sweep !== undefined &&
          (!Number.isInteger(instrument.sweep) ||
            instrument.sweep < 0 ||
            instrument.sweep > 255)) ||
        !Number.isInteger(instrument.reg1) ||
        instrument.reg1 < 0 ||
        instrument.reg1 > 255 ||
        !Number.isInteger(instrument.reg2) ||
        instrument.reg2 < 0 ||
        instrument.reg2 > 255 ||
        !Number.isInteger(instrument.reg3) ||
        instrument.reg3 < 0 ||
        instrument.reg3 > 255
    )
  ) {
    throw new ProjectLauncherError(`Music "${music.name}" has invalid instrument register values.`)
  }

  const patternIds = new Set(document.patterns.map((pattern) => pattern.id))

  if (patternIds.size !== document.patterns.length) {
    throw new ProjectLauncherError(`Music "${music.name}" has duplicate pattern ids.`)
  }

  for (const pattern of document.patterns) {
    if (pattern.steps.some((step) => step.noteIndex > 71 && step.noteIndex !== 0xff)) {
      throw new ProjectLauncherError(
        `Music "${music.name}" has a pattern step with an invalid note.`
      )
    }

    if (
      pattern.steps.some(
        (step) =>
          step.instrument < 0 ||
          (step.instrument >= document.instruments.length &&
            !(
              document.instruments.length === 0 &&
              step.noteIndex === 0xff &&
              step.instrument === 0
            ))
      )
    ) {
      throw new ProjectLauncherError(
        `Music "${music.name}" has a pattern step with an invalid instrument.`
      )
    }
  }

  for (const channel of MUSIC_CHANNELS) {
    const missingPatternId = document.sequence[channel].find(
      (patternId) => patternId !== null && !patternIds.has(patternId)
    )

    if (missingPatternId) {
      throw new ProjectLauncherError(
        `Music "${music.name}" references a missing pattern: ${missingPatternId}`
      )
    }
  }

  const sequenceLength = Math.max(
    ...MUSIC_CHANNELS.map((channel) => document.sequence[channel].length)
  )

  if (sequenceLength < 1 || sequenceLength > 255) {
    throw new ProjectLauncherError(`Music "${music.name}" has an invalid sequence length.`)
  }

  return document
}

const getMusicSequenceEntry = (
  identifier: string,
  patternsById: Map<string, MusicPattern & { index: number }>,
  patternId: string | null | undefined
): string => {
  if (!patternId) {
    return '(void*) 0'
  }

  const pattern = patternsById.get(patternId)
  return pattern ? `&${identifier}_pattern_${pattern.index}` : '(void*) 0'
}

export const buildMusicResourceFiles = (
  music: ProjectAssetRecordLike
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = assertValidMusicDocument(music)
  const resourceDirectory = `res/${music.identifier}`
  const headerPath = `${resourceDirectory}/${music.identifier}.h`
  const sourcePath = `${resourceDirectory}/${music.identifier}.c`
  const sequenceLength = Math.max(
    ...MUSIC_CHANNELS.map((channel) => document.sequence[channel].length)
  )
  const patternsById = new Map(
    document.patterns.map((pattern, index) => [pattern.id, { ...pattern, index }])
  )

  const headerContent = [
    `#ifndef ${music.identifier.toUpperCase()}_H`,
    `#define ${music.identifier.toUpperCase()}_H`,
    '#include "Assets/Music/Music.h"',
    '',
    `extern const Instrument ${music.identifier}_instruments[];`,
    ...document.patterns.map(
      (_pattern, index) => `extern const Pattern ${music.identifier}_pattern_${index};`
    ),
    '',
    `extern const Pattern* const ${music.identifier}_ch1_sequence[];`,
    `extern const Pattern* const ${music.identifier}_ch2_sequence[];`,
    `extern const Pattern* const ${music.identifier}_ch4_sequence[];`,
    '',
    `#endif /* ${music.identifier.toUpperCase()}_H */`,
    ''
  ].join('\n')

  const instrumentLines = [
    `const Instrument ${music.identifier}_instruments[] = {`,
    ...(document.instruments.length > 0
      ? document.instruments.map(
          (instrument) =>
            `    { .sweep = ${formatHexByte(instrument.sweep ?? 0)}, .reg1 = ${formatHexByte(instrument.reg1)}, .reg2 = ${formatHexByte(instrument.reg2)}, .reg3 = ${formatHexByte(instrument.reg3)} },`
        )
      : ['    { .sweep = 0x00, .reg1 = 0x00, .reg2 = 0x00, .reg3 = 0x00 },']),
    '};'
  ]
  const patternLines = document.patterns.flatMap((pattern, index) => [
    `const Pattern ${music.identifier}_pattern_${index} = {`,
    '    .steps = {',
    ...pattern.steps.map((step) => `        ${formatMusicStep(step.noteIndex, step.instrument)},`),
    '    }',
    '};',
    ''
  ])
  const sequenceLines = MUSIC_CHANNELS.flatMap((channel) => [
    `const Pattern* const ${music.identifier}_${channel}_sequence[] = {`,
    ...Array.from({ length: sequenceLength }, (_, index) => {
      return `    ${getMusicSequenceEntry(
        music.identifier,
        patternsById,
        document.sequence[channel][index]
      )},`
    }),
    '};',
    ''
  ])
  const sourceContent = [
    `#pragma bank ${music.bank}`,
    `#include "${music.identifier}.h"`,
    '',
    `BANKREF(${music.identifier}_bankref)`,
    '',
    ...instrumentLines,
    '',
    ...patternLines,
    ...sequenceLines
  ].join('\n')

  return {
    headerPath,
    sourcePath,
    headerContent,
    sourceContent
  }
}

export const buildSongRegistryFiles = (
  songs: ProjectAssetRecordLike[]
): { headerContent: string; sourceContent: string } => {
  const includeLines = songs.map((song) => `#include "${song.identifier}/${song.identifier}.h"`)
  const enumLines =
    songs.length > 0 ? songs.map((song) => `    ${song.identifier},`) : ['    NUMBER_OF_SONGS = 1']
  const headerContent = [
    '#ifndef SONG_REGISTRY_H',
    '#define SONG_REGISTRY_H',
    '',
    '#include "Music.h"',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    'typedef enum {',
    ...enumLines,
    ...(songs.length > 0 ? ['    NUMBER_OF_SONGS'] : []),
    '} SongType;',
    '',
    'extern const Song* const songs[NUMBER_OF_SONGS];',
    '',
    '#endif /* SONG_REGISTRY_H */',
    ''
  ].join('\n')

  if (songs.length === 0) {
    return {
      headerContent,
      sourceContent: [
        '#include "SongRegistry.h"',
        '',
        'const Song* const songs[NUMBER_OF_SONGS] = {',
        '    (void*) 0',
        '};',
        ''
      ].join('\n')
    }
  }

  const songDefinitionLines = songs.flatMap((song) => {
    const document = assertValidMusicDocument(song)
    const sequenceLength = Math.max(
      ...MUSIC_CHANNELS.map((channel) => document.sequence[channel].length)
    )

    return [
      `BANKREF_EXTERN(${song.identifier}_bankref)`,
      `const Song _${song.identifier} = {`,
      `    .bank = BANK(${song.identifier}_bankref),`,
      `    .speed = ${formatHexByte(document.speed)},`,
      `    .sequence_length = ${formatHexByte(sequenceLength)},`,
      `    .instruments = ${song.identifier}_instruments,`,
      `    .ch1_seq = ${song.identifier}_ch1_sequence,`,
      `    .ch2_seq = ${song.identifier}_ch2_sequence,`,
      `    .ch4_seq = ${song.identifier}_ch4_sequence`,
      '};',
      ''
    ]
  })

  return {
    headerContent,
    sourceContent: [
      '#include "SongRegistry.h"',
      '',
      ...songDefinitionLines,
      'const Song* const songs[NUMBER_OF_SONGS] = {',
      ...songs.map((song) => `    [${song.identifier}] = &_${song.identifier},`),
      '};',
      ''
    ].join('\n')
  }
}

// builds the animation registry
export const buildAnimationRegistryFiles = (
  sprites: ProjectAssetRecordLike[],
  use8x16SpriteMode = sprites.some((sprite) => (sprite.document as SpriteAssetDocument).is8x16Mode)
): { headerContent: string; sourceContent: string } => {
  const includeLines = sprites.map(
    (sprite) => `#include "${sprite.identifier}/${sprite.identifier}.h"`
  )
  const enumLines =
    sprites.length > 0
      ? sprites.map((sprite) => `        ${sprite.identifier},`)
      : ['        NUMBER_OF_ANIMATIONS = 1']
  // header:
  // avoid redefinitions
  // include SpaceManager and Animation
  // include sprite headers
  // declare the AnimationType enum with an entry for each sprite and a NUMBER_OF_ANIMATIONS entry if there are any sprites
  // declare the animations array and the animation_data array with NUMBER_OF_ANIMATIONS entries
  const headerContent = [
    '#ifndef ANIMATION_REGISTRY_H',
    '#define ANIMATION_REGISTRY_H',
    '#include "Assets/SpaceManager.h"',
    '#include "Animation.h"',
    '',
    `#define SPRITES_8X16_ENABLED ${use8x16SpriteMode ? 1 : 0}`,
    '',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    'typedef enum {',
    ...enumLines,
    ...(sprites.length > 0 ? ['        NUMBER_OF_ANIMATIONS'] : []),
    '    } AnimationType;',
    '',
    'extern const Animation* animations[NUMBER_OF_ANIMATIONS];',
    'extern const AssetEntry animation_data[NUMBER_OF_ANIMATIONS];',
    '',
    '#endif /* ANIMATION_REGISTRY_H */',
    ''
  ].join('\n')
  // source (if there are no sprites):
  // include the header
  // if there are no sprites, define the animations and animation_data arrays with empty entries
  if (sprites.length === 0) {
    return {
      headerContent,
      sourceContent: [
        '#include "AnimationRegistry.h"',
        '',
        'const Animation* animations[NUMBER_OF_ANIMATIONS] = {',
        '    (void*) 0',
        '};',
        '',
        'const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {',
        '    {0, (void*) 0}',
        '};',
        ''
      ].join('\n')
    }
  }
  // source (if there are sprites):
  // include the header
  // define an Animation struct for each sprite with its properties and a reference to its metasprite data if it's a metasprite
  // define the bank ref for each sprite
  // define the animations array with references to each animation struct
  // define the animation_data array with entries for each sprite pointing to its bank and sprite data
  const animationDefinitionLines = sprites.flatMap((sprite) => {
    const document = sprite.document as SpriteAssetDocument
    const hasMetasprite = hasSpriteMetaspriteLayout(document, use8x16SpriteMode)
    const metaspriteExpression = hasMetasprite
      ? `${sprite.identifier}_metasprite_data`
      : '(void*) 0'

    return [
      `const Animation _${sprite.identifier} = {`,
      `    .animation_id = ${sprite.identifier},`,
      `    .width = ${document.width},`,
      `    .height = ${document.height},`,
      `    .number_of_frames = ${document.frames.length},`,
      `    .frame_duration = ${buildAnimationDuration(document.fps)},`,
      `    .metasprite = ${metaspriteExpression}`,
      '};',
      ''
    ]
  })
  const bankRefLines = sprites.map((sprite) => `BANKREF_EXTERN(${sprite.identifier}_bankref)`)

  return {
    headerContent,
    sourceContent: [
      '#include "AnimationRegistry.h"',
      '',
      ...animationDefinitionLines,
      ...bankRefLines,
      '',
      'const Animation* animations[NUMBER_OF_ANIMATIONS] = {',
      ...sprites.map((sprite) => `    [${sprite.identifier}] = &_${sprite.identifier},`),
      '};',
      '',
      'const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {',
      ...sprites.map(
        (sprite) =>
          `    [${sprite.identifier}] = {BANK(${sprite.identifier}_bankref), ${sprite.identifier}_sprite_data},`
      ),
      '};',
      ''
    ].join('\n')
  }
}

// builds the map registry
export const buildMapRegistryFiles = (
  tilemaps: ProjectAssetRecordLike[],
  windows: ProjectAssetRecordLike[],
  tilesetsByPath: Map<string, ProjectAssetRecordLike>
): { headerContent: string; sourceContent: string } => {
  // first, combine tilemaps and windows into one list, setting window split properties to 0 for tilemaps
  // and to the actual values for windows
  const maps = [
    ...tilemaps.map((resource) => ({
      ...resource,
      windowTopEnd: 0,
      windowBottomStart: 0,
      windowVisibilityBands: [] as WindowVisibilityBand[]
    })),
    ...windows.map((resource) => {
      const document = resource.document as WindowAssetDocument
      return {
        ...resource,
        windowTopEnd: 0,
        windowBottomStart: 0,
        windowVisibilityBands:
          document.windowVisibilityBands ??
          normalizeLegacyWindowVisibilityBands(
            Number((document as WindowAssetDocument & { windowTopEnd?: number }).windowTopEnd ?? 0),
            Number(
              (document as WindowAssetDocument & { windowBottomStart?: number }).windowBottomStart ??
                0
            ),
            document.height,
            Number((document as WindowAssetDocument & { windowY?: number }).windowY ?? 0)
          )
      }
    })
  ].map((resource) => {
    // for each one, check if it can use a shared tileset
    const document = resource.document as TilemapAssetDocument | WindowAssetDocument
    const tileset = document.tilesetPath ? tilesetsByPath.get(document.tilesetPath) : null

    if (!tileset) {
      throw new ProjectLauncherError(
        `Map "${resource.name}" references a missing tileset resource: ${document.tilesetPath ?? 'none'}`
      )
    }

    return {
      ...resource,
      tileset,
      usesSharedTileset: canReuseSharedTilesetForMap(resource, tileset)
    }
  })
  const includeLines = maps.map((map) => `#include "${map.identifier}/${map.identifier}.h"`)
  const enumLines =
    maps.length > 0
      ? maps.map((map) => `        ${map.identifier},`)
      : ['        NUMBER_OF_MAPS = 1']
  // header:
  // avoid redefinitions
  // include SpaceManager and Map
  // include map headers
  // declare the MapType enum with an entry for each map and a NUMBER_OF_MAPS entry if there are any maps
  // declare the maps array and the map_data array with NUMBER_OF_MAPS entries
  const headerContent = [
    '#ifndef MAP_DECLARATIONS_H',
    '#define MAP_DECLARATIONS_H',
    '',
    '#include "Map.h"',
    '#include "Assets/SpaceManager.h"',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    'typedef enum {',
    ...enumLines,
    ...(maps.length > 0 ? ['        NUMBER_OF_MAPS'] : []),
    '    } MapType;',
    '',
    'extern Map* maps[NUMBER_OF_MAPS];',
    'extern const AssetEntry map_data[NUMBER_OF_MAPS];',
    '',
    '#endif /* MAP_DECLARATIONS_H */',
    ''
  ].join('\n')

  // source (if there are no maps):
  // include the header
  // if there are no maps, define the maps and map_data arrays with empty entries
  if (maps.length === 0) {
    return {
      headerContent,
      sourceContent: [
        '#include "MapRegistry.h"',
        '',
        'Map* maps[NUMBER_OF_MAPS] = {',
        '    (void*) 0',
        '};',
        '',
        'const AssetEntry map_data[NUMBER_OF_MAPS] = {',
        '    {0, (void*) 0}',
        '};',
        ''
      ].join('\n')
    }
  }

  // source (if there are maps):
  // include the header
  // define a Map struct for each map with its properties and a reference to its tileset if it's using a shared tileset
  // define the bank ref for each map
  // define the maps array with references to each Map struct
  // define the map_data array with entries for each map pointing to its bank and map data
  const mapDefinitionLines = maps.flatMap((map) => {
    const document = map.document as TilemapAssetDocument | WindowAssetDocument
    const runtimeGrid = buildRuntimeMapGrid(document, map.windowVisibilityBands)
    return [
      `Map _${map.identifier} = {`,
      `    .id = ${map.identifier},`,
      `    .width = ${document.width},`,
      `    .height = ${runtimeGrid.height},`,
      `    .tileset = ${map.usesSharedTileset ? map.tileset.identifier : map.identifier}_tileset,`,
      `    .num_tiles = ${map.usesSharedTileset ? map.tileset.identifier : map.identifier}_num_tiles,`,
      '    .first_tile = 0,',
      `    .window_top_end = ${map.windowTopEnd},`,
      `    .window_bottom_start = ${map.windowBottomStart}`,
      '};',
      ''
    ]
  })
  const bankRefLines = maps.map((map) => `BANKREF_EXTERN(${map.identifier}_bankref)`)

  return {
    headerContent,
    sourceContent: [
      '#include "MapRegistry.h"',
      '',
      ...mapDefinitionLines,
      ...bankRefLines,
      '',
      'Map* maps[NUMBER_OF_MAPS] = {',
      ...maps.map((map) => `    [${map.identifier}] = &_${map.identifier},`),
      '};',
      '',
      'const AssetEntry map_data[NUMBER_OF_MAPS] = {',
      ...maps.map(
        (map) =>
          `    [${map.identifier}] = {BANK(${map.identifier}_bankref), ${map.identifier}_map_data},`
      ),
      '};',
      ''
    ].join('\n')
  }
}

// build the actor registry header
export const buildActorRegistryHeader = (
  actorScripts: ProjectScriptRecordResolved[],
  projectTags: ProjectTagEntry[] = []
): string => {
  const actors = [
    { identifier: MANAGED_DEFAULT_ACTOR_IDENTIFIER },
    ...actorScripts.map((script) => ({ identifier: script.identifier }))
  ]

  // header:
  // avoid redefinitions
  // include MainDefinitions
  // define the ACTORS macro with an entry for each actor script and a default actor entry
  // define the ActorType enum using the ACTORS macro
  // declare the actor update and init function arrays with NUM_ACTORS entries
  // declare the init_actor_functions function
  // declare the update and init functions for each actor script using the ACTORS macro
  // define a Tags enum
  return [
    '#ifndef ACTOR_REGISTRY_H',
    '#define ACTOR_REGISTRY_H',
    '#include "MainDefinitions.h"',
    '#define ACTORS \\',
    ...actors.map((actor) => `    _ACTOR(${actor.identifier}) \\`),
    '',
    '#define _ACTOR(name) _##name,',
    'typedef enum {',
    '    ACTORS',
    '    NUM_ACTORS',
    '} ActorType;',
    '#undef _ACTOR',
    '',
    'extern FAR_PTR actor_update_functions[NUM_ACTORS];',
    'extern FAR_PTR actor_init_functions[NUM_ACTORS];',
    '',
    'void init_actor_functions(void);',
    '',
    '#define _ACTOR(name) \\',
    '    BANKREF_EXTERN(name##_bankref) \\',
    '    void Actor_Update_##name(void) BANKED; \\',
    '    void Actor_Init_##name(void) BANKED;',
    'ACTORS',
    '#undef _ACTOR',
    '',
    'typedef enum {',
    '    TAG_NONE,',
    ...projectTags.map((tag) => `    ${buildProjectTagEnumName(tag.name)},`),
    '} Tags;',
    '',
    '#endif // ACTOR_REGISTRY_H',
    ''
  ].join('\n')
}

// build the scene registry header
export const buildSceneRegistryHeader = (sceneIdentifiers: string[]): string => {
  const scenes = Array.from(
    new Set(sceneIdentifiers.length > 0 ? sceneIdentifiers : ['SampleScene'])
  )

  // header:
  // avoid redefinitions
  // include MainDefinitions
  // define the SCENES macro with an entry for each scene identifier or a default SampleScene entry
  // define the SceneType enum using the SCENES macro
  // declare the scene update and init function arrays with NUM_SCENES entries
  // declare the init_scene_functions function
  // declare the update and init functions for each scene using the SCENES macro
  return [
    '#ifndef SCENE_REGISTRY_H',
    '#define SCENE_REGISTRY_H',
    '#include "../MainDefinitions.h"',
    '',
    '#define SCENES \\',
    ...scenes.map((sceneIdentifier) => `    _SCENE(${sceneIdentifier}) \\`),
    '',
    '#define _SCENE(name) _##name,',
    'typedef enum { ',
    '    SCENES ',
    '    NUM_SCENES ',
    '} SceneType; ',
    '#undef _SCENE',
    '',
    'extern FAR_PTR scene_init_state_functions[NUM_SCENES];',
    'extern FAR_PTR scene_update_functions[NUM_SCENES]; ',
    '',
    'void init_scene_functions(void);',
    '',
    '#define _SCENE(name) \\',
    '    BANKREF_EXTERN(name##_bankref) \\',
    '    void scene_init_state_##name(void) BANKED; \\',
    '    void scene_update_##name(void) BANKED; ',
    '    SCENES ',
    '#undef _SCENE',
    '',
    '#endif /* SCENE_REGISTRY_H */',
    ''
  ].join('\n')
}
