import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProjectAssetFile, saveProjectAssetFile } from '../../../src/main/projectAssetFiles'
import { saveProjectSaveDataState, saveProjectTagState } from '../../../src/main/projectMetadata'
import { createProjectStructure } from '../../../src/main/projectLauncher'
import { normalizeCodeIdentifierStem } from '../../../src/shared/codeIdentifiers'
import {
  buildProjectCode,
  copyBundledEngineCore,
  listProjectScriptCallbackCandidates,
  loadProjectScriptResource,
  saveProjectScriptResource
} from '../../../src/main/projectCode'
import {
  createProjectResource,
  createProjectScriptResource,
  deleteProjectResource,
  listProjectScriptResources,
  updateProjectResourceBank,
  updateProjectStartingScene
} from '../../../src/main/projectResources'

const tempDirectories: string[] = []

const prepareBundledGbdkFixture = async (workspaceDirectory: string): Promise<void> => {
  const bundledGbdkPath = join(workspaceDirectory, 'bundled-gbdk')
  const bundledGbdkBinPath = join(bundledGbdkPath, 'bin')
  await mkdir(bundledGbdkBinPath, { recursive: true })
  await writeFile(join(bundledGbdkBinPath, 'lcc'), '', { encoding: 'utf-8', flag: 'w' })
  process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = bundledGbdkPath
}

describe('projectCode integration', () => {
  afterEach(async () => {
    delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('collects compatible callbacks from general, actor, and scene scripts while excluding reserved entry points', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const generalScript = await createProjectScriptResource(project.path, 'general', 'Shared')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'Hero')
    const sceneScript = await createProjectScriptResource(project.path, 'scene', 'Room')

    const loadedGeneral = await loadProjectScriptResource(
      project.path,
      generalScript.resourcePath,
      'general'
    )
    const loadedActor = await loadProjectScriptResource(
      project.path,
      actorScript.resourcePath,
      'actor'
    )
    const loadedScene = await loadProjectScriptResource(
      project.path,
      sceneScript.resourcePath,
      'scene'
    )

    await saveProjectScriptResource(
      project.path,
      generalScript.resourcePath,
      'general',
      'void OnSharedCollision(void){\n}\n\nstatic void HiddenShared(void){\n}\n\nvoid SharedNeedsArgs(uint8_t value){\n    value = value;\n}\n',
      loadedGeneral.headerContent
    )
    await saveProjectScriptResource(
      project.path,
      actorScript.resourcePath,
      'actor',
      'void AINIT(void){\n}\n\nvoid AUPDATE(void){\n}\n\nvoid OnHeroCollision(void){\n}\n',
      loadedActor.headerContent
    )
    await saveProjectScriptResource(
      project.path,
      sceneScript.resourcePath,
      'scene',
      'void SINIT(void) BANKED{\n}\n\nvoid SUPDATE(void){\n}\n\nvoid OnRoomCollision(void){\n}\n',
      loadedScene.headerContent
    )

    const scripts = await listProjectScriptResources(project.path)
    const candidates = await listProjectScriptCallbackCandidates(project.path, scripts)

    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          scriptPath: generalScript.resourcePath,
          scriptKind: 'general',
          scriptName: 'Shared',
          functionName: 'OnSharedCollision'
        },
        {
          scriptPath: actorScript.resourcePath,
          scriptKind: 'actor',
          scriptName: 'Hero',
          functionName: 'OnHeroCollision'
        },
        {
          scriptPath: sceneScript.resourcePath,
          scriptKind: 'scene',
          scriptName: 'Room',
          functionName: 'OnRoomCollision'
        }
      ])
    )
    expect(candidates.some((candidate) => candidate.functionName === 'AINIT')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'AUPDATE')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SINIT')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SUPDATE')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'HiddenShared')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SharedNeedsArgs')).toBe(false)
  }, 60_000)

  it('removes stale generated resource directories and registry entries after deleting a tracked asset', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteDirectory = join(project.path, 'res', spriteIdentifier)
    const animationRegistryPath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.h'
    )
    const animationRegistrySourcePath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.c'
    )

    await buildProjectCode(project.path)

    expect((await stat(join(spriteDirectory, `${spriteIdentifier}.c`))).isFile()).toBe(true)
    expect(await readFile(animationRegistryPath, 'utf-8')).toContain(
      `#include "${spriteIdentifier}/${spriteIdentifier}.h"`
    )

    await deleteProjectResource(project.path, 'sprite', sprite.resourcePath)
    await buildProjectCode(project.path)

    await expect(stat(spriteDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    const emptyAnimationRegistryHeader = await readFile(animationRegistryPath, 'utf-8')
    const emptyAnimationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(emptyAnimationRegistryHeader).not.toContain(
      `#include "${spriteIdentifier}/${spriteIdentifier}.h"`
    )
    expect(emptyAnimationRegistryHeader).not.toContain('empty_sprite')
    expect(emptyAnimationRegistryHeader).toContain('NUMBER_OF_ANIMATIONS = 1')
    expect(emptyAnimationRegistrySource).not.toContain('empty_sprite')
    expect(emptyAnimationRegistrySource).toContain(
      'const Animation* animations[NUMBER_OF_ANIMATIONS] = {'
    )
    expect(emptyAnimationRegistrySource).toContain(
      'const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {'
    )
  })

  it('rewrites generated resource output and dependent code when an asset changes', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteSourcePath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.c`)
    const animationRegistryPath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.h'
    )
    const animationRegistrySourcePath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.c'
    )

    await buildProjectCode(project.path)

    const initialSpriteSource = await readFile(spriteSourcePath, 'utf-8')
    const initialAnimationRegistry = await readFile(animationRegistryPath, 'utf-8')
    const initialAnimationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')
    const loadedSprite = await loadProjectAssetFile(project.path, sprite.resourcePath)

    if (loadedSprite.document.kind !== 'sprite') {
      throw new Error('Expected a sprite document.')
    }

    await saveProjectAssetFile(project.path, sprite.resourcePath, {
      ...loadedSprite.document,
      width: 16,
      height: 16,
      fps: 12,
      currentFrame: 0,
      frames: [new Array(256).fill(1), new Array(256).fill(2)]
    })

    await buildProjectCode(project.path)

    const updatedSpriteSource = await readFile(spriteSourcePath, 'utf-8')
    const updatedAnimationRegistry = await readFile(animationRegistryPath, 'utf-8')
    const updatedAnimationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(updatedSpriteSource).not.toBe(initialSpriteSource)
    expect(updatedSpriteSource).toContain(
      `const metasprite_t ${spriteIdentifier}_metasprite_data[] = {`
    )
    expect(updatedAnimationRegistry).toContain(`${spriteIdentifier},`)
    expect(updatedAnimationRegistrySource).not.toBe(initialAnimationRegistrySource)
    expect(updatedAnimationRegistrySource).toContain(`.frame_duration = 5`)
    expect(updatedAnimationRegistrySource).toContain(
      `.metasprite = ${spriteIdentifier}_metasprite_data`
    )
  })

  it('generates engine-native music resources and song registry entries', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const music = await createProjectResource(project.path, 'music', '', 'Battle Theme')
    const musicIdentifier = normalizeCodeIdentifierStem('Battle Theme')

    await saveProjectAssetFile(project.path, music.resourcePath, {
      kind: 'music',
      version: 1,
      speed: 6,
      loop: true,
      instruments: [
        { name: 'Lead', reg1: 0x80, reg2: 0xf2, reg3: 0x20 },
        { name: 'Noise', reg1: 0x3f, reg2: 0xf1, reg3: 0x23 }
      ],
      patterns: [
        {
          id: 'main',
          name: 'Main',
          steps: [
            { noteIndex: 12, instrument: 1 },
            ...Array.from({ length: 15 }, () => ({ noteIndex: 0xff, instrument: 0 }))
          ]
        }
      ],
      sequence: {
        ch1: ['main'],
        ch2: [null],
        ch4: ['main']
      }
    })

    const result = await buildProjectCode(project.path)
    const musicSource = await readFile(
      join(project.path, 'res', musicIdentifier, `${musicIdentifier}.c`),
      'utf-8'
    )
    const songRegistryHeader = await readFile(
      join(project.path, 'src', 'Assets', 'Music', 'SongRegistry.h'),
      'utf-8'
    )
    const songRegistrySource = await readFile(
      join(project.path, 'src', 'Assets', 'Music', 'SongRegistry.c'),
      'utf-8'
    )

    expect(result.musicCount).toBe(1)
    expect(musicSource).toContain(`const Instrument ${musicIdentifier}_instruments[]`)
    expect(musicSource).toContain('{ .reg1 = 0x80, .reg2 = 0xF2, .reg3 = 0x20 }')
    expect(musicSource).toContain('{ .note_index = 0x0C, .instrument = 0x01 }')
    expect(musicSource).toContain(`const Pattern* const ${musicIdentifier}_ch2_sequence[] = {`)
    expect(musicSource).toContain('(void*) 0')
    expect(musicSource).not.toContain(`BANK(${musicIdentifier}_bankref)`)
    expect(songRegistryHeader).toContain(`${musicIdentifier},`)
    expect(songRegistryHeader).toContain(`#include "${musicIdentifier}/${musicIdentifier}.h"`)
    expect(songRegistrySource).toContain(`BANKREF_EXTERN(${musicIdentifier}_bankref)`)
    expect(songRegistrySource).toContain(`const Song _${musicIdentifier} = {`)
    expect(songRegistrySource).toContain(`.bank = BANK(${musicIdentifier}_bankref)`)
    expect(songRegistrySource).toContain(`.speed = 0x06`)
    expect(songRegistrySource).toContain(`[${musicIdentifier}] = &_${musicIdentifier}`)
  })

  it('generates a shared metasprite layout for sparse sprite frames', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteSourcePath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.c`)
    const animationRegistrySourcePath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.c'
    )
    const loadedSprite = await loadProjectAssetFile(project.path, sprite.resourcePath)

    if (loadedSprite.document.kind !== 'sprite') {
      throw new Error('Expected a sprite document.')
    }

    const leftTileFrame = new Array(128).fill(0)
    const rightTileFrame = new Array(128).fill(0)

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        leftTileFrame[y * 16 + x] = 1
        rightTileFrame[y * 16 + (x + 8)] = 2
      }
    }

    await saveProjectAssetFile(project.path, sprite.resourcePath, {
      ...loadedSprite.document,
      width: 16,
      height: 8,
      fps: 6,
      currentFrame: 0,
      frames: [leftTileFrame, rightTileFrame]
    })

    await buildProjectCode(project.path)

    const spriteSource = await readFile(spriteSourcePath, 'utf-8')
    const animationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(spriteSource).toContain(`const metasprite_t ${spriteIdentifier}_metasprite_data[] = {`)
    expect(spriteSource).toContain('{ .dy=-4, .dx=-8, .dtile=0, .props=0 },')
    expect(spriteSource).toContain('{ .dy=0, .dx=8, .dtile=1, .props=0 },')
    expect(animationRegistrySource).toContain(`.metasprite = ${spriteIdentifier}_metasprite_data`)
  })

  it('generates 8x16 metasprite offsets using 16-pixel sprite rows', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteSourcePath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.c`)
    const animationRegistrySourcePath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.c'
    )
    const loadedSprite = await loadProjectAssetFile(project.path, sprite.resourcePath)

    if (loadedSprite.document.kind !== 'sprite') {
      throw new Error('Expected a sprite document.')
    }

    const frame = new Array(16 * 32).fill(0)
    for (let y = 16; y < 32; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        frame[y * 16 + x] = 1
      }
    }

    await saveProjectAssetFile(project.path, sprite.resourcePath, {
      ...loadedSprite.document,
      width: 16,
      height: 32,
      fps: 6,
      is8x16Mode: true,
      currentFrame: 0,
      frames: [frame]
    })

    await buildProjectCode(project.path)

    const spriteSource = await readFile(spriteSourcePath, 'utf-8')
    const animationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(spriteSource).toContain(`const metasprite_t ${spriteIdentifier}_metasprite_data[] = {`)
    expect(spriteSource).toContain('{ .dy=0, .dx=-8, .dtile=4, .props=0 },')
    expect(spriteSource).toContain('{ .dy=0, .dx=8, .dtile=6, .props=0 },')
    expect(animationRegistrySource).toContain(`.metasprite = ${spriteIdentifier}_metasprite_data`)
  })

  it('keeps a single 8x16 sprite as a plain sprite without metasprite tables', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteSourcePath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.c`)
    const spriteHeaderPath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.h`)
    const animationRegistrySourcePath = join(
      project.path,
      'src',
      'Assets',
      'Animations',
      'AnimationRegistry.c'
    )
    const loadedSprite = await loadProjectAssetFile(project.path, sprite.resourcePath)

    if (loadedSprite.document.kind !== 'sprite') {
      throw new Error('Expected a sprite document.')
    }

    await saveProjectAssetFile(project.path, sprite.resourcePath, {
      ...loadedSprite.document,
      width: 8,
      height: 16,
      fps: 6,
      is8x16Mode: true,
      currentFrame: 0,
      frames: [new Array(8 * 16).fill(1)]
    })

    await buildProjectCode(project.path)

    const spriteSource = await readFile(spriteSourcePath, 'utf-8')
    const spriteHeader = await readFile(spriteHeaderPath, 'utf-8')
    const animationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(spriteHeader).not.toContain('metasprite_data')
    expect(spriteSource).not.toContain('_metasprite_data')
    expect(animationRegistrySource).toContain('.metasprite = (void*) 0')
  })

  it('keeps map registries valid after deleting the last generated map resource', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const mapIdentifier = normalizeCodeIdentifierStem('Dungeon')
    const mapDirectory = join(project.path, 'res', mapIdentifier)
    const mapRegistryHeaderPath = join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.h')
    const mapRegistrySourcePath = join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.c')
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected a tilemap document.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })

    await buildProjectCode(project.path)

    expect((await stat(join(mapDirectory, `${mapIdentifier}.c`))).isFile()).toBe(true)
    expect(await readFile(mapRegistryHeaderPath, 'utf-8')).toContain(`${mapIdentifier},`)

    await deleteProjectResource(project.path, 'tilemap', tilemap.resourcePath)
    await buildProjectCode(project.path)

    await expect(stat(mapDirectory)).rejects.toMatchObject({ code: 'ENOENT' })

    const emptyMapRegistryHeader = await readFile(mapRegistryHeaderPath, 'utf-8')
    const emptyMapRegistrySource = await readFile(mapRegistrySourcePath, 'utf-8')

    expect(emptyMapRegistryHeader).not.toContain('empty_map')
    expect(emptyMapRegistryHeader).toContain('NUMBER_OF_MAPS = 1')
    expect(emptyMapRegistrySource).not.toContain('empty_map')
    expect(emptyMapRegistrySource).toContain('Map* maps[NUMBER_OF_MAPS] = {')
    expect(emptyMapRegistrySource).toContain('const AssetEntry map_data[NUMBER_OF_MAPS] = {')
  })

  it('reuses same-bank tileset resources from generated map registry entries when the bank is explicit', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const mapIdentifier = normalizeCodeIdentifierStem('Dungeon')
    const tilesetIdentifier = normalizeCodeIdentifierStem('Dungeon Tiles')
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected a tilemap document.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await updateProjectResourceBank(project.path, 'tilemap', tilemap.resourcePath, 7)
    await updateProjectResourceBank(project.path, 'tileset', tileset.resourcePath, 7)

    await buildProjectCode(project.path)

    const mapHeader = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.h`),
      'utf-8'
    )
    const mapSource = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.c`),
      'utf-8'
    )
    const mapRegistrySource = await readFile(
      join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.c'),
      'utf-8'
    )

    expect(mapHeader).toContain(`#include "${tilesetIdentifier}/${tilesetIdentifier}.h"`)
    expect(mapHeader).toContain(`#define ${mapIdentifier}_tileset ${tilesetIdentifier}_tileset`)
    expect(mapHeader).toContain(`#define ${mapIdentifier}_num_tiles ${tilesetIdentifier}_num_tiles`)
    expect(mapSource).toContain(`const uint8_t ${mapIdentifier}_map_data[] = {`)
    expect(mapSource).not.toContain(`const uint8_t ${mapIdentifier}_tileset[] = {`)
    expect(mapRegistrySource).toContain(`.tileset = ${tilesetIdentifier}_tileset,`)
    expect(mapRegistrySource).toContain(`.num_tiles = ${tilesetIdentifier}_num_tiles,`)
  })

  it('keeps per-map tileset copies when the map and tileset are both autobanked', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const mapIdentifier = normalizeCodeIdentifierStem('Dungeon')
    const tilesetIdentifier = normalizeCodeIdentifierStem('Dungeon Tiles')
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected a tilemap document.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })

    await buildProjectCode(project.path)

    const mapHeader = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.h`),
      'utf-8'
    )
    const mapSource = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.c`),
      'utf-8'
    )
    const mapRegistrySource = await readFile(
      join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.c'),
      'utf-8'
    )

    expect(mapHeader).not.toContain(`#include "${tilesetIdentifier}/${tilesetIdentifier}.h"`)
    expect(mapSource).toContain(`const uint8_t ${mapIdentifier}_tileset[] = {`)
    expect(mapRegistrySource).toContain(`.tileset = ${mapIdentifier}_tileset,`)
    expect(mapRegistrySource).toContain(`.num_tiles = ${mapIdentifier}_num_tiles,`)
  })

  it('generates split window map data already compacted for runtime loading', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Window Tiles')
    const windowResource = await createProjectResource(project.path, 'window', '', 'Dialog Window')
    const windowIdentifier = normalizeCodeIdentifierStem('Dialog Window')
    const loadedWindow = await loadProjectAssetFile(project.path, windowResource.resourcePath)

    if (loadedWindow.document.kind !== 'window') {
      throw new Error('Expected a window document.')
    }

    const width = 4
    const height = 18
    const grid = Array.from({ length: width * height }, (_, index) => Math.floor(index / width))

    await saveProjectAssetFile(project.path, windowResource.resourcePath, {
      ...loadedWindow.document,
      width,
      height,
      grid,
      tilesetPath: tileset.resourcePath,
      windowTopEnd: 2,
      windowBottomStart: 15
    })

    await buildProjectCode(project.path)

    const windowSource = await readFile(
      join(project.path, 'res', windowIdentifier, `${windowIdentifier}.c`),
      'utf-8'
    )
    const mapRegistrySource = await readFile(
      join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.c'),
      'utf-8'
    )
    const compactMapData = [
      ...new Array(width).fill(0),
      ...new Array(width).fill(1),
      ...new Array(width).fill(15),
      ...new Array(width).fill(16),
      ...new Array(width).fill(17)
    ]
      .map((value) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`)
      .join(',')

    expect(windowSource.replace(/\s/g, '')).toContain(compactMapData)
    expect(mapRegistrySource).toContain('.height = 5,')
    expect(mapRegistrySource).toContain('.window_top_end = 2,')
    expect(mapRegistrySource).toContain('.window_bottom_start = 15')
  })

  it('keeps per-map tileset copies when the map and tileset banks differ', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const mapIdentifier = normalizeCodeIdentifierStem('Dungeon')
    const tilesetIdentifier = normalizeCodeIdentifierStem('Dungeon Tiles')
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected a tilemap document.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await updateProjectResourceBank(project.path, 'tileset', tileset.resourcePath, 7)

    await buildProjectCode(project.path)

    const mapHeader = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.h`),
      'utf-8'
    )
    const mapSource = await readFile(
      join(project.path, 'res', mapIdentifier, `${mapIdentifier}.c`),
      'utf-8'
    )
    const mapRegistrySource = await readFile(
      join(project.path, 'src', 'Assets', 'Map', 'MapRegistry.c'),
      'utf-8'
    )

    expect(mapHeader).not.toContain(`#include "${tilesetIdentifier}/${tilesetIdentifier}.h"`)
    expect(mapSource).toContain(`const uint8_t ${mapIdentifier}_tileset[] = {`)
    expect(mapRegistrySource).toContain(`.tileset = ${mapIdentifier}_tileset,`)
    expect(mapRegistrySource).toContain(`.num_tiles = ${mapIdentifier}_num_tiles,`)
  })

  it('generates save-data blocks from the project save-data state', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)

    await saveProjectSaveDataState(project.path, {
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        },
        {
          id: 'last_position',
          name: 'last_position',
          type: 'uint16_t',
          defaultValue: '128'
        }
      ]
    })

    await buildProjectCode(project.path)

    const saveDataHeader = await readFile(join(project.path, 'src', 'Saves', 'SaveData.h'), 'utf-8')
    const saveDataSource = await readFile(join(project.path, 'src', 'Saves', 'SaveData.c'), 'utf-8')

    expect(saveDataHeader).toContain('uint8_t coins;')
    expect(saveDataHeader).toContain('uint16_t last_position;')
    expect(saveDataSource).toContain('save_data.coins = 0;')
    expect(saveDataSource).toContain('save_data.last_position = 128;')
  })

  it('generates a scripted scene wrapper and rewrites main.c to the selected starting scene', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const scene = await createProjectResource(project.path, 'scene', '', 'Room')
    const sceneScript = await createProjectScriptResource(project.path, 'scene', 'RoomLogic')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')

    const loadedScene = await loadProjectAssetFile(project.path, scene.resourcePath)
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedScene.document.kind !== 'scene' || loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected scene and tilemap documents.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...loadedScene.document,
      tilemapPath: tilemap.resourcePath,
      scriptPath: sceneScript.resourcePath
    })
    await updateProjectStartingScene(project.path, scene.resourcePath)

    await buildProjectCode(project.path)

    const mainSource = await readFile(join(project.path, 'src', 'main.c'), 'utf-8')
    const roomLogicSource = await readFile(join(project.path, sceneScript.resourcePath), 'utf-8')
    const roomSceneSource = await readFile(
      join(project.path, 'src', 'CustomScenes', 'room.c'),
      'utf-8'
    )
    const roomSceneHeader = await readFile(
      join(project.path, 'src', 'CustomScenes', 'room.h'),
      'utf-8'
    )
    const projectBindingsPath = join(project.path, 'src', 'Generated', 'ProjectBindings.c')

    expect(mainSource).toContain('#include "CustomScenes/room.h"')
    expect(mainSource).toContain('room* ss = (room*) malloc(sizeof(room));')
    expect(mainSource).toContain('ss->base.type = _room;')
    expect(mainSource).toContain('set_scene((Scene*) ss);')
    expect(roomLogicSource).not.toContain('// BEGIN GENERATED SCENE INITIALIZATION')
    expect(roomSceneHeader).toContain('#include "CustomScenes/RoomLogic.h"')
    expect(roomSceneHeader).toContain('typedef RoomLogic room;')
    expect(roomSceneSource).toContain(
      'FAR_CALL(TO_FAR_PTR(scene_init_state_RoomLogic, BANK(RoomLogic_bankref)), RVoid_PVoid_BANKED);'
    )
    expect(roomSceneSource).toContain(
      'FAR_CALL(TO_FAR_PTR(scene_update_RoomLogic, BANK(RoomLogic_bankref)), RVoid_PVoid_BANKED);'
    )
    expect(roomSceneSource).toContain('// BEGIN GENERATED SCENE INITIALIZATION')
    expect(roomSceneSource).toContain('set_scene_map(maps[dungeon]);')
    await expect(stat(projectBindingsPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('sets scene hardware palettes during generated initialization', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const scene = await createProjectResource(project.path, 'scene', '', 'Palette Room')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Palette Map')
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Palette Tiles')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Palette Hero')

    const loadedScene = await loadProjectAssetFile(project.path, scene.resourcePath)
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedScene.document.kind !== 'scene' || loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected scene and tilemap documents.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...loadedScene.document,
      tilemapPath: tilemap.resourcePath,
      backgroundPalette: ['#ffffff', '#aaaaaa', '#555555', '#000000'],
      spritePalettes: [
        ['#000000', '#555555', '#aaaaaa', '#ffffff'],
        ['#ffffff', '#aaaaaa', '#555555', '#000000']
      ],
      nodes: [
        {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: sprite.resourcePath,
          spritePaletteIndex: 1,
          x: 0,
          y: 0,
          physicsMode: 'balanced',
          followCamera: false,
          children: []
        }
      ]
    })

    await buildProjectCode(project.path)

    const sceneSource = await readFile(
      join(project.path, 'src', 'CustomScenes', 'palette_room.c'),
      'utf-8'
    )

    expect(sceneSource).toContain('BGP_REG = 0xE4;')
    expect(sceneSource).toContain('OBP0_REG = 0x1B;')
    expect(sceneSource).toContain('OBP1_REG = 0xE4;')
    expect(sceneSource).toContain('set_animation_props(S_PALETTE, 8, 16);')
    expect(sceneSource.indexOf('BGP_REG = 0xE4;')).toBeLessThan(
      sceneSource.indexOf('set_scene_map(maps[palette_map]);')
    )
  })

  it('emits project tags into the actor registry and generated scene initialization', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const scene = await createProjectResource(project.path, 'scene', '', 'Room')
    await createProjectScriptResource(project.path, 'actor', 'Hero')
    const loadedScene = await loadProjectAssetFile(project.path, scene.resourcePath)

    if (loadedScene.document.kind !== 'scene') {
      throw new Error('Expected scene document.')
    }

    await saveProjectTagState(project.path, {
      entries: [
        { id: 'player', name: 'Player' },
        { id: 'hurtbox', name: 'Hurt Box' }
      ]
    })
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...loadedScene.document,
      nodes: [
        {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          tags: ['player'],
          x: 0,
          y: 0,
          physicsMode: 'highPerf',
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
              tags: ['hurtbox'],
              callbacks: [],
              exitCallbacks: [
                {
                  scriptPath: 'src/CustomActors/Hero.c',
                  functionName: 'OnHeroCollisionExit'
                }
              ],
              children: []
            }
          ]
        }
      ]
    })

    await buildProjectCode(project.path)

    const actorRegistry = await readFile(
      join(project.path, 'src', 'Actor', 'ActorRegistry.h'),
      'utf-8'
    )
    const sceneSource = await readFile(join(project.path, 'src', 'CustomScenes', 'room.c'), 'utf-8')

    expect(actorRegistry).toContain('TAG_PLAYER,')
    expect(actorRegistry).toContain('TAG_HURT_BOX,')
    expect(sceneSource).toContain('generated_actor_0->physics_mode = HIGH_PERF;')
    expect(sceneSource).toContain('set_tag(TAG_PLAYER, 0);')
    expect(sceneSource).toContain('generated_actor_1_collider->tags[0] = TAG_HURT_BOX;')
    expect(sceneSource).toContain(
      'set_collision_exit_callback(generated_actor_1_collider, TO_FAR_PTR(OnHeroCollisionExit, BANK(Hero_bankref)));'
    )
  })

  it('generates separate CustomScenes entries when multiple scenes share one scene script', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const firstScene = await createProjectResource(project.path, 'scene', '', 'First Room')
    const secondScene = await createProjectResource(project.path, 'scene', '', 'Second Room')
    const sceneScript = await createProjectScriptResource(project.path, 'scene', 'SharedRoomLogic')
    const firstTilemap = await createProjectResource(project.path, 'tilemap', '', 'First Dungeon')
    const secondTilemap = await createProjectResource(project.path, 'tilemap', '', 'Second Dungeon')
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const loadedFirstScene = await loadProjectAssetFile(project.path, firstScene.resourcePath)
    const loadedSecondScene = await loadProjectAssetFile(project.path, secondScene.resourcePath)
    const loadedFirstTilemap = await loadProjectAssetFile(project.path, firstTilemap.resourcePath)
    const loadedSecondTilemap = await loadProjectAssetFile(project.path, secondTilemap.resourcePath)

    if (
      loadedFirstScene.document.kind !== 'scene' ||
      loadedSecondScene.document.kind !== 'scene' ||
      loadedFirstTilemap.document.kind !== 'tilemap' ||
      loadedSecondTilemap.document.kind !== 'tilemap'
    ) {
      throw new Error('Expected scene and tilemap documents.')
    }

    await saveProjectAssetFile(project.path, firstTilemap.resourcePath, {
      ...loadedFirstTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await saveProjectAssetFile(project.path, secondTilemap.resourcePath, {
      ...loadedSecondTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await saveProjectAssetFile(project.path, firstScene.resourcePath, {
      ...loadedFirstScene.document,
      tilemapPath: firstTilemap.resourcePath,
      scriptPath: sceneScript.resourcePath
    })
    await saveProjectAssetFile(project.path, secondScene.resourcePath, {
      ...loadedSecondScene.document,
      tilemapPath: secondTilemap.resourcePath,
      scriptPath: sceneScript.resourcePath
    })

    await buildProjectCode(project.path)

    const firstSceneSource = await readFile(
      join(project.path, 'src', 'CustomScenes', 'first_room.c'),
      'utf-8'
    )
    const secondSceneSource = await readFile(
      join(project.path, 'src', 'CustomScenes', 'second_room.c'),
      'utf-8'
    )
    const sceneRegistry = await readFile(
      join(project.path, 'src', 'Scene', 'SceneRegistry.h'),
      'utf-8'
    )
    const sharedScriptSource = await readFile(join(project.path, sceneScript.resourcePath), 'utf-8')

    expect(firstSceneSource).toContain(
      'FAR_CALL(TO_FAR_PTR(scene_init_state_SharedRoomLogic, BANK(SharedRoomLogic_bankref)), RVoid_PVoid_BANKED);'
    )
    expect(firstSceneSource).toContain('set_scene_map(maps[first_dungeon]);')
    expect(secondSceneSource).toContain(
      'FAR_CALL(TO_FAR_PTR(scene_init_state_SharedRoomLogic, BANK(SharedRoomLogic_bankref)), RVoid_PVoid_BANKED);'
    )
    expect(secondSceneSource).toContain('set_scene_map(maps[second_dungeon]);')
    expect(sceneRegistry).toContain('_SCENE(first_room)')
    expect(sceneRegistry).toContain('_SCENE(second_room)')
    expect(sharedScriptSource).not.toContain('// BEGIN GENERATED SCENE INITIALIZATION')
  })

  it('can rebuild scenes without custom scene scripts without treating managed scene files as user scripts', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const scene = await createProjectResource(project.path, 'scene', '', 'Room')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')

    const loadedScene = await loadProjectAssetFile(project.path, scene.resourcePath)
    const loadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)

    if (loadedScene.document.kind !== 'scene' || loadedTilemap.document.kind !== 'tilemap') {
      throw new Error('Expected scene and tilemap documents.')
    }

    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...loadedTilemap.document,
      tilesetPath: tileset.resourcePath
    })
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...loadedScene.document,
      tilemapPath: tilemap.resourcePath
    })
    await updateProjectStartingScene(project.path, scene.resourcePath)

    await buildProjectCode(project.path)
    await buildProjectCode(project.path)

    const roomScenePath = join(
      project.path,
      'src',
      'CustomScenes',
      `${normalizeCodeIdentifierStem('Room')}.c`
    )
    const sampleScenePath = join(project.path, 'src', 'CustomScenes', 'SampleScene.c')

    expect(await readFile(roomScenePath, 'utf-8')).toContain('// RETROGBFULL MANAGED SCENE FILE')
    await expect(stat(sampleScenePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('copies the bundled gbdk directory next to the project during build', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const siblingGbdkPath = join(workspaceDirectory, 'gbdk')
    await prepareBundledGbdkFixture(workspaceDirectory)

    await expect(stat(siblingGbdkPath)).rejects.toMatchObject({ code: 'ENOENT' })

    await buildProjectCode(project.path)

    expect((await stat(siblingGbdkPath)).isDirectory()).toBe(true)
    expect((await stat(join(siblingGbdkPath, 'bin'))).isDirectory()).toBe(true)
    expect((await stat(join(siblingGbdkPath, 'bin', 'lcc'))).isFile()).toBe(true)
  })

  it('refreshes existing core files when copying the bundled engine core again', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const mainSourcePath = join(project.path, 'src', 'main.c')

    await writeFile(mainSourcePath, '// local override that should be replaced\n', 'utf-8')

    const copyResult = await copyBundledEngineCore(project.path)
    const refreshedMainSource = await readFile(mainSourcePath, 'utf-8')

    expect(copyResult.copiedPaths).toContain('src/main.c')
    expect(copyResult.skippedPaths).not.toContain('src/main.c')
    expect(refreshedMainSource).toContain('#include "GameManager/GameManager.h"')
    expect(refreshedMainSource).toContain('init_actor_functions();')
    expect(refreshedMainSource).not.toContain('local override that should be replaced')
  })

  it('emits non-default banks into generated resources and managed script preambles', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await prepareBundledGbdkFixture(workspaceDirectory)
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const script = await createProjectScriptResource(project.path, 'general', 'Shared')
    const spriteIdentifier = normalizeCodeIdentifierStem('Hero')
    const spriteSourcePath = join(project.path, 'res', spriteIdentifier, `${spriteIdentifier}.c`)
    const scriptSourcePath = join(project.path, script.resourcePath)

    await updateProjectResourceBank(project.path, 'sprite', sprite.resourcePath, 7)
    await updateProjectResourceBank(project.path, 'script', script.resourcePath, 23)

    const loadedScript = await loadProjectScriptResource(
      project.path,
      script.resourcePath,
      'general'
    )
    expect(loadedScript.managedSourcePrefix).toContain('#pragma bank 23')

    await saveProjectScriptResource(
      project.path,
      script.resourcePath,
      'general',
      'void helper(void){\n}\n',
      loadedScript.headerContent
    )

    await buildProjectCode(project.path)

    expect(await readFile(spriteSourcePath, 'utf-8')).toContain('#pragma bank 7')
    expect(await readFile(scriptSourcePath, 'utf-8')).toContain('#pragma bank 23')
  })
})
