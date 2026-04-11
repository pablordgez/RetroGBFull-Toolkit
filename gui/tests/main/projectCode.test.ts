import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProjectAssetFile, saveProjectAssetFile } from '../../src/main/projectAssetFiles'
import { createProjectStructure } from '../../src/main/projectLauncher'
import {
  generateProjectResourceFiles,
  listProjectScriptCallbackCandidates,
  loadProjectScriptResource,
  normalizeResourceIdentifierStem,
  saveProjectScriptResource
} from '../../src/main/projectCode'
import {
  createProjectResource,
  createProjectScriptResource,
  deleteProjectResource,
  listProjectScriptResources
} from '../../src/main/projectResources'

const tempDirectories: string[] = []

describe('projectCode collision callback helpers', () => {
  afterEach(async () => {
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

    const loadedGeneral = await loadProjectScriptResource(project.path, generalScript.resourcePath, 'general')
    const loadedActor = await loadProjectScriptResource(project.path, actorScript.resourcePath, 'actor')
    const loadedScene = await loadProjectScriptResource(project.path, sceneScript.resourcePath, 'scene')

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
  })

  it('removes stale generated resource directories and registry entries after deleting a tracked asset', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeResourceIdentifierStem('Hero')
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

    await generateProjectResourceFiles(project.path)

    expect((await stat(join(spriteDirectory, `${spriteIdentifier}.c`))).isFile()).toBe(true)
    expect(await readFile(animationRegistryPath, 'utf-8')).toContain(
      `#include "${spriteIdentifier}/${spriteIdentifier}.h"`
    )

    await deleteProjectResource(project.path, 'sprite', sprite.resourcePath)
    await generateProjectResourceFiles(project.path)

    await expect(stat(spriteDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    const emptyAnimationRegistryHeader = await readFile(animationRegistryPath, 'utf-8')
    const emptyAnimationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(emptyAnimationRegistryHeader).not.toContain(
      `#include "${spriteIdentifier}/${spriteIdentifier}.h"`
    )
    expect(emptyAnimationRegistryHeader).not.toContain('empty_sprite')
    expect(emptyAnimationRegistryHeader).toContain('NUMBER_OF_ANIMATIONS = 1')
    expect(emptyAnimationRegistrySource).not.toContain('empty_sprite')
    expect(emptyAnimationRegistrySource).toContain('const Animation* animations[NUMBER_OF_ANIMATIONS] = {')
    expect(emptyAnimationRegistrySource).toContain('const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {')
  })

  it('rewrites generated resource output and dependent code when an asset changes', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')
    const spriteIdentifier = normalizeResourceIdentifierStem('Hero')
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

    await generateProjectResourceFiles(project.path)

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

    await generateProjectResourceFiles(project.path)

    const updatedSpriteSource = await readFile(spriteSourcePath, 'utf-8')
    const updatedAnimationRegistry = await readFile(animationRegistryPath, 'utf-8')
    const updatedAnimationRegistrySource = await readFile(animationRegistrySourcePath, 'utf-8')

    expect(updatedSpriteSource).not.toBe(initialSpriteSource)
    expect(updatedSpriteSource).toContain(
      `const metasprite_t ${spriteIdentifier}_metasprite_data[] = {`
    )
    expect(updatedAnimationRegistry).toContain(`${spriteIdentifier},`)
    expect(updatedAnimationRegistrySource).not.toBe(initialAnimationRegistrySource)
    expect(updatedAnimationRegistrySource).toContain(
      `.frame_duration = 5`
    )
    expect(updatedAnimationRegistrySource).toContain(
      `.metasprite = ${spriteIdentifier}_metasprite_data`
    )
  })

  it('keeps map registries valid after deleting the last generated map resource', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const tileset = await createProjectResource(project.path, 'tileset', '', 'Dungeon Tiles')
    const tilemap = await createProjectResource(project.path, 'tilemap', '', 'Dungeon')
    const mapIdentifier = normalizeResourceIdentifierStem('Dungeon')
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

    await generateProjectResourceFiles(project.path)

    expect((await stat(join(mapDirectory, `${mapIdentifier}.c`))).isFile()).toBe(true)
    expect(await readFile(mapRegistryHeaderPath, 'utf-8')).toContain(`${mapIdentifier},`)

    await deleteProjectResource(project.path, 'tilemap', tilemap.resourcePath)
    await generateProjectResourceFiles(project.path)

    await expect(stat(mapDirectory)).rejects.toMatchObject({ code: 'ENOENT' })

    const emptyMapRegistryHeader = await readFile(mapRegistryHeaderPath, 'utf-8')
    const emptyMapRegistrySource = await readFile(mapRegistrySourcePath, 'utf-8')

    expect(emptyMapRegistryHeader).not.toContain('empty_map')
    expect(emptyMapRegistryHeader).toContain('NUMBER_OF_MAPS = 1')
    expect(emptyMapRegistrySource).not.toContain('empty_map')
    expect(emptyMapRegistrySource).toContain('Map* maps[NUMBER_OF_MAPS] = {')
    expect(emptyMapRegistrySource).toContain('const AssetEntry map_data[NUMBER_OF_MAPS] = {')
  })
})
