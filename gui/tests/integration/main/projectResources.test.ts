import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectStructure } from '../../../src/main/projectLauncher'
import {
  ensureProjectAssetFileAvailable,
  loadProjectAssetFile,
  saveProjectAssetFile
} from '../../../src/main/projectAssetFiles'
import {
  createProjectFolder,
  createProjectResource,
  createProjectScriptResource,
  deleteProjectResource,
  deleteProjectFolder,
  finalizeDeletedProjectResource,
  listProjectResources,
  renameProjectResource,
  renameProjectFolder,
  restoreDeletedProjectResource,
  scanProjectDirectory,
  transferProjectResource,
  updateProjectResourceBank,
  updateProjectStartingScene
} from '../../../src/main/projectResources'
import {
  PROJECT_ASSET_EXTENSIONS,
  ProjectAssetKind,
  type ActorAssetDocument,
  type SceneAssetDocument,
  createDefaultProjectAssetDocument,
  serializeProjectAssetDocument
} from '../../../src/shared/projectAssets'
import { loadProjectScriptResource } from '../../../src/main/projectCode'

const tempDirectories: string[] = []

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('projectResources integration', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('lists only tracked resources from the project json and ignores unrelated files on disk', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectFolder(project.path, '')
    await renameProjectFolder(project.path, 'New Folder', 'Sprites')
    await createProjectFolder(project.path, 'Sprites')
    await renameProjectFolder(project.path, 'Sprites/New Folder', 'Actors')
    await writeFile(join(project.path, 'notes.txt'), 'hello', 'utf-8')

    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')
    const projectFileContents = JSON.parse(
      await readFile(join(project.path, 'MyProject.json'), 'utf-8')
    ) as {
      resources: {
        items: Array<{ path: string; type: string }>
      }
    }

    expect(rootView.items.map((item) => [item.type, item.name])).toEqual([['folder', 'Sprites']])
    expect(spritesView.items.map((item) => [item.type, item.name])).toEqual([['folder', 'Actors']])
    expect(projectFileContents.resources.items.map((resource) => resource.path)).toEqual([
      'Sprites',
      'Sprites/Actors'
    ])
  })

  it('creates, renames, and deletes folders while keeping the project json in sync', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const createdFolder = await createProjectFolder(project.path)
    const renamedFolder = await renameProjectFolder(project.path, createdFolder.folderPath, 'Audio')
    const deletedFolder = await deleteProjectFolder(project.path, renamedFolder.folderPath)
    const projectFileContents = JSON.parse(
      await readFile(join(project.path, 'MyProject.json'), 'utf-8')
    ) as {
      resources: {
        items: Array<{ path: string }>
      }
    }

    expect(createdFolder.folderPath).toBe('New Folder')
    expect(renamedFolder.folderPath).toBe('Audio')
    expect(
      renamedFolder.view.items.some((item) => item.type === 'folder' && item.name === 'Audio')
    ).toBe(true)
    expect(deletedFolder.view.items).toEqual([])
    expect(projectFileContents.resources.items).toEqual([])
  })

  it('supports generic resource create, rename, delete, restore, and finalize operations for folders', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const createdFolder = await createProjectResource(project.path, 'folder', '', 'Scripts')
    const renamedFolder = await renameProjectResource(
      project.path,
      'folder',
      createdFolder.resourcePath,
      'Logic'
    )
    const deletedFolder = await deleteProjectResource(
      project.path,
      'folder',
      renamedFolder.resourcePath
    )
    const restoredFolder = await restoreDeletedProjectResource(
      project.path,
      deletedFolder.deletionId
    )
    await finalizeDeletedProjectResource(project.path, deletedFolder.deletionId)
    const finalView = await listProjectResources(project.path)

    expect(createdFolder.resourcePath).toBe('Scripts')
    expect(renamedFolder.resourcePath).toBe('Logic')
    expect(deletedFolder.view.items).toEqual([])
    expect(restoredFolder.resourcePath).toBe('Logic')
    expect(finalView.items.map((item) => item.name)).toEqual(['Logic'])
  })

  it('creates supported asset files, lists them as typed resources, and persists saved data', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const assetKinds: ProjectAssetKind[] = ['sprite', 'tileset', 'tilemap', 'window', 'music']

    for (const assetKind of assetKinds) {
      const createdAsset = await createProjectResource(
        project.path,
        assetKind,
        '',
        `Demo ${assetKind}`
      )
      const createdFilePath = join(
        project.path,
        `Demo ${assetKind}${PROJECT_ASSET_EXTENSIONS[assetKind]}`
      )
      const createdFile = await readFile(createdFilePath, 'utf-8')

      expect(createdAsset.resourceType).toBe(assetKind)
      expect(createdAsset.resourceName).toBe(`Demo ${assetKind}`)
      expect(createdAsset.resourcePath).toBe(
        `Demo ${assetKind}${PROJECT_ASSET_EXTENSIONS[assetKind]}`
      )
      expect(createdFile).toContain(`"kind": "${assetKind}"`)
    }

    const rootView = await listProjectResources(project.path)
    expect(
      rootView.items.map((item) => [
        item.type,
        item.name,
        item.type === 'file' ? item.resourceType : null
      ])
    ).toEqual([
      ['file', 'Demo music', 'music'],
      ['file', 'Demo sprite', 'sprite'],
      ['file', 'Demo tilemap', 'tilemap'],
      ['file', 'Demo tileset', 'tileset'],
      ['file', 'Demo window', 'window']
    ])

    const spritePath = `Demo sprite${PROJECT_ASSET_EXTENSIONS.sprite}`
    const loadedSprite = await loadProjectAssetFile(project.path, spritePath)
    expect(loadedSprite.assetKind).toBe('sprite')
    expect(loadedSprite.document.kind).toBe('sprite')

    if (loadedSprite.document.kind !== 'sprite') {
      throw new Error('Expected a sprite document.')
    }

    const updatedSprite = {
      ...loadedSprite.document,
      width: 16,
      height: 16,
      frames: [new Array(256).fill(1)]
    }

    await saveProjectAssetFile(project.path, spritePath, updatedSprite)

    const reloadedSprite = await loadProjectAssetFile(project.path, spritePath)
    expect(reloadedSprite.document).toEqual(updatedSprite)
  })

  it('auto-increments default asset names across folders when a global name is already used', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    const rootSprite = await createProjectResource(project.path, 'sprite', '')
    const nestedSprite = await createProjectResource(project.path, 'sprite', 'Sprites')

    expect(rootSprite.resourceName).toBe('New Sprite')
    expect(rootSprite.resourcePath).toBe(`New Sprite${PROJECT_ASSET_EXTENSIONS.sprite}`)
    expect(nestedSprite.resourceName).toBe('New Sprite 2')
    expect(nestedSprite.resourcePath).toBe(`Sprites/New Sprite 2${PROJECT_ASSET_EXTENSIONS.sprite}`)
  })

  it('auto-increments default script names across script kinds when a global script name is already used', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const actorScript = await createProjectScriptResource(project.path, 'actor')
    const generalScript = await createProjectScriptResource(project.path, 'general')
    const sceneScript = await createProjectScriptResource(project.path, 'scene')

    expect(actorScript.resourceName).toBe('New_Script')
    expect(actorScript.resourcePath).toBe('src/CustomActors/New_Script.c')
    expect(generalScript.resourceName).toBe('New_Script_2')
    expect(generalScript.resourcePath).toBe('src/Scripts/New_Script_2.c')
    expect(sceneScript.resourceName).toBe('New_Script_3')
    expect(sceneScript.resourcePath).toBe('src/CustomScenes/New_Script_3.c')
  })

  it('keeps new general script source content empty after the managed preamble', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const createdScript = await createProjectScriptResource(project.path, 'general', 'Shared')
    const createdSource = await readFile(join(project.path, createdScript.resourcePath), 'utf-8')

    expect(createdSource).toBe(
      '#pragma bank 255\n#include "Shared.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Shared_bankref)\n\n'
    )
  })

  it('loads preamble-only general scripts with an empty editable source body', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const createdScript = await createProjectScriptResource(project.path, 'general', 'Shared')
    const loadedScript = await loadProjectScriptResource(
      project.path,
      createdScript.resourcePath,
      'general'
    )

    expect(loadedScript.editableSourceContent).toBe('')
    expect(loadedScript.managedSourcePrefix).toBe(
      '#pragma bank 255\n#include "Shared.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(Shared_bankref)\n\n'
    )
  })

  it('updates ScriptEnvironment.h to include project script headers', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectScriptResource(project.path, 'actor', 'Hero')
    await createProjectScriptResource(project.path, 'general', 'Shared')
    await createProjectScriptResource(project.path, 'scene', 'RoomLogic')

    const environmentHeader = await readFile(
      join(project.path, 'src', 'ScriptEnvironment.h'),
      'utf-8'
    )

    expect(environmentHeader).toContain('#include "CustomActors/Hero.h"')
    expect(environmentHeader).toContain('#include "CustomScenes/RoomLogic.h"')
    expect(environmentHeader).toContain('#include "Scripts/Shared.h"')
  })

  it('renames tracked src resources without moving bundled engine core files', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'Hero')

    await renameProjectResource(project.path, 'folder', 'src', 'Source')

    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
    expect(await pathExists(join(project.path, 'Source', 'main.c'))).toBe(false)
    expect(await pathExists(join(project.path, actorScript.resourcePath))).toBe(false)
    expect(await pathExists(join(project.path, 'Source', 'CustomActors', 'Hero.c'))).toBe(true)
    expect(await pathExists(join(project.path, 'Source', 'CustomActors', 'Hero.h'))).toBe(true)

    await renameProjectResource(project.path, 'folder', 'Source', 'src')

    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
    expect(await pathExists(join(project.path, 'Source'))).toBe(false)
    expect(await pathExists(join(project.path, actorScript.resourcePath))).toBe(true)
    expect(await readFile(join(project.path, 'src', 'ScriptEnvironment.h'), 'utf-8')).toContain(
      '#include "CustomActors/Hero.h"'
    )
  })

  it('does not rename random asset folders into the engine src folder', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'sprite', 'Sprites', 'Hero')

    await expect(renameProjectResource(project.path, 'folder', 'Sprites', 'src')).rejects.toThrow(
      'Only a renamed code folder can be restored to the engine src folder.'
    )

    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
    expect(await pathExists(join(project.path, 'src', 'Hero.rgbsprite.json'))).toBe(false)
    expect(await pathExists(join(project.path, 'Sprites', 'Hero.rgbsprite.json'))).toBe(true)
  })

  it('moves scripts within renamed code roots and back to recreated canonical roots', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectScriptResource(project.path, 'actor', 'Hero')
    await renameProjectResource(project.path, 'folder', 'src', 'Source')
    await createProjectResource(project.path, 'folder', 'Source/CustomActors', 'Archive')

    const archivedScript = await transferProjectResource(
      project.path,
      'script',
      'Source/CustomActors/Hero.c',
      'Source/CustomActors/Archive',
      'move'
    )

    expect(archivedScript.resourcePath).toBe('Source/CustomActors/Archive/Hero.c')
    expect(
      await pathExists(join(project.path, 'Source', 'CustomActors', 'Archive', 'Hero.c'))
    ).toBe(true)

    await createProjectScriptResource(project.path, 'actor', 'Temp')
    const restoredScript = await transferProjectResource(
      project.path,
      'script',
      archivedScript.resourcePath,
      'src/CustomActors',
      'move'
    )

    expect(restoredScript.resourcePath).toBe('src/CustomActors/Hero.c')
    expect(await pathExists(join(project.path, 'src', 'CustomActors', 'Hero.c'))).toBe(true)
    expect(
      await pathExists(join(project.path, 'Source', 'CustomActors', 'Archive', 'Hero.c'))
    ).toBe(false)
  })

  it('moves managed src into a folder and back without leaving empty script subfolders', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectScriptResource(project.path, 'actor', 'Hero')
    await createProjectResource(project.path, 'folder', 'src/CustomActors', 'Enemies')
    await transferProjectResource(
      project.path,
      'script',
      'src/CustomActors/Hero.c',
      'src/CustomActors/Enemies',
      'move'
    )
    await createProjectResource(project.path, 'folder', '', 'src_old')

    const movedSrc = await transferProjectResource(project.path, 'folder', 'src', 'src_old', 'move')

    expect(movedSrc.resourcePath).toBe('src_old/src')
    expect(
      await pathExists(join(project.path, 'src_old', 'src', 'CustomActors', 'Enemies', 'Hero.c'))
    ).toBe(true)
    expect(await pathExists(join(project.path, 'src', 'CustomActors', 'Enemies'))).toBe(false)
    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)

    const restoredSrc = await transferProjectResource(
      project.path,
      'folder',
      movedSrc.resourcePath,
      '',
      'move'
    )

    expect(restoredSrc.resourcePath).toBe('src')
    expect(await pathExists(join(project.path, 'src', 'CustomActors', 'Enemies', 'Hero.c'))).toBe(
      true
    )
    expect(await pathExists(join(project.path, 'src_old', 'src'))).toBe(false)
    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
  })

  it('deletes and restores tracked src resources without deleting bundled engine core files', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'Hero')

    const deletedSrc = await deleteProjectResource(project.path, 'folder', 'src')

    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
    expect(await pathExists(join(project.path, actorScript.resourcePath))).toBe(false)

    await restoreDeletedProjectResource(project.path, deletedSrc.deletionId)

    expect(await pathExists(join(project.path, 'src', 'main.c'))).toBe(true)
    expect(await pathExists(join(project.path, actorScript.resourcePath))).toBe(true)
    expect(await pathExists(join(project.path, 'src', 'CustomActors', 'Hero.h'))).toBe(true)
  })

  it('refreshes ScriptEnvironment.h when general scripts are deleted, restored, and moved', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const generalScript = await createProjectScriptResource(project.path, 'general', 'Shared')
    await createProjectResource(project.path, 'folder', 'src/Scripts', 'Archive')
    const environmentHeaderPath = join(project.path, 'src', 'ScriptEnvironment.h')

    expect(await readFile(environmentHeaderPath, 'utf-8')).toContain('#include "Scripts/Shared.h"')

    const deletedScript = await deleteProjectResource(
      project.path,
      'script',
      generalScript.resourcePath
    )
    expect(await readFile(environmentHeaderPath, 'utf-8')).not.toContain(
      '#include "Scripts/Shared.h"'
    )

    await restoreDeletedProjectResource(project.path, deletedScript.deletionId)
    expect(await readFile(environmentHeaderPath, 'utf-8')).toContain('#include "Scripts/Shared.h"')

    const movedScript = await transferProjectResource(
      project.path,
      'script',
      generalScript.resourcePath,
      'src/Scripts/Archive',
      'move'
    )
    expect(movedScript.resourcePath).toBe('src/Scripts/Archive/Shared.c')
    expect(await readFile(environmentHeaderPath, 'utf-8')).toContain(
      '#include "Scripts/Archive/Shared.h"'
    )
    expect(await readFile(environmentHeaderPath, 'utf-8')).not.toContain(
      '#include "Scripts/Shared.h"'
    )
  })

  it('copies assets with unique names and moves them into other folders', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'folder', '', 'Archive')
    await createProjectResource(project.path, 'sprite', '', 'Hero')

    const copiedAsset = await transferProjectResource(
      project.path,
      'sprite',
      `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`,
      'Sprites',
      'copy'
    )
    const duplicateAsset = await transferProjectResource(
      project.path,
      'sprite',
      `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`,
      'Sprites',
      'copy'
    )
    const movedAsset = await transferProjectResource(
      project.path,
      'sprite',
      `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`,
      'Archive',
      'move'
    )

    expect(copiedAsset.resourcePath).toBe(`Sprites/Hero 2${PROJECT_ASSET_EXTENSIONS.sprite}`)
    expect(duplicateAsset.resourcePath).toBe(`Sprites/Hero 3${PROJECT_ASSET_EXTENSIONS.sprite}`)
    expect(movedAsset.resourcePath).toBe(`Archive/Hero${PROJECT_ASSET_EXTENSIONS.sprite}`)

    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')
    const archiveView = await listProjectResources(project.path, 'Archive')

    expect(rootView.items.map((item) => item.name)).toEqual(['Archive', 'Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero 2', 'Hero 3'])
    expect(archiveView.items.map((item) => item.name)).toEqual(['Hero'])
  })

  it('moves tracked folders together with their tracked descendants', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'folder', '', 'Archive')
    await createProjectResource(project.path, 'folder', 'Sprites', 'Enemies')
    await createProjectResource(project.path, 'sprite', 'Sprites/Enemies', 'Bat')

    const movedFolder = await transferProjectResource(
      project.path,
      'folder',
      'Sprites',
      'Archive',
      'move'
    )

    expect(movedFolder.resourcePath).toBe('Archive/Sprites')

    const rootView = await listProjectResources(project.path)
    const archiveView = await listProjectResources(project.path, 'Archive')
    const nestedView = await listProjectResources(project.path, 'Archive/Sprites/Enemies')

    expect(rootView.items.map((item) => item.name)).toEqual(['Archive'])
    expect(archiveView.items.map((item) => item.name)).toEqual(['Sprites'])
    expect(nestedView.items.map((item) => item.name)).toEqual(['Bat'])
  })

  it('updates asset references when referenced resources and folders are moved or renamed', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Tilesets')
    await createProjectResource(project.path, 'folder', '', 'Maps')
    await createProjectResource(project.path, 'folder', '', 'Scenes')
    await createProjectResource(project.path, 'folder', '', 'Actors')
    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'folder', '', 'Archive')

    const tileset = await createProjectResource(project.path, 'tileset', 'Tilesets', 'Main')
    const tilemap = await createProjectResource(project.path, 'tilemap', 'Maps', 'Room')
    const scene = await createProjectResource(project.path, 'scene', 'Scenes', 'Intro')
    const actor = await createProjectResource(project.path, 'actor', 'Actors', 'Hero')
    const sprite = await createProjectResource(project.path, 'sprite', 'Sprites', 'HeroSprite')
    const sceneScript = await createProjectScriptResource(project.path, 'scene', 'RoomLogic')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'HeroLogic')

    const tilemapPayload = await loadProjectAssetFile(project.path, tilemap.resourcePath)
    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...tilemapPayload.document,
      tilesetPath: tileset.resourcePath
    })

    const scenePayload = await loadProjectAssetFile(project.path, scene.resourcePath)
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...scenePayload.document,
      tilemapPath: tilemap.resourcePath,
      scriptPath: sceneScript.resourcePath,
      scriptProperties: {
        background: tilemap.resourcePath
      },
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          resourcePath: actor.resourcePath,
          spritePath: sprite.resourcePath,
          scriptPath: actorScript.resourcePath,
          scriptProperties: {
            idle_animation: sprite.resourcePath
          },
          x: 0,
          y: 0,
          physicsMode: 'balanced',
          followCamera: false,
          children: [
            {
              id: 'hero-hitbox',
              type: 'collision',
              name: 'Hitbox',
              isCollapsed: false,
              x: 0,
              y: 0,
              width: 8,
              height: 8,
              isBlocking: true,
              callbacks: [{ scriptPath: actorScript.resourcePath, functionName: 'OnEnter' }],
              exitCallbacks: [{ scriptPath: actorScript.resourcePath, functionName: 'OnExit' }],
              children: []
            }
          ]
        }
      ]
    } as SceneAssetDocument)

    const actorPayload = await loadProjectAssetFile(project.path, actor.resourcePath)
    await saveProjectAssetFile(project.path, actor.resourcePath, {
      ...actorPayload.document,
      root: {
        ...(actorPayload.document as ActorAssetDocument).root,
        spritePath: sprite.resourcePath,
        scriptPath: actorScript.resourcePath,
        scriptProperties: {
          idle_animation: sprite.resourcePath
        }
      }
    } as ActorAssetDocument)

    const renamedMapsFolder = await renameProjectResource(project.path, 'folder', 'Maps', 'Levels')
    const renamedTileset = await renameProjectResource(
      project.path,
      'tileset',
      tileset.resourcePath,
      'Ground'
    )
    const movedSpritesFolder = await transferProjectResource(
      project.path,
      'folder',
      'Sprites',
      'Archive',
      'move'
    )
    const movedActor = await transferProjectResource(
      project.path,
      'actor',
      actor.resourcePath,
      'Archive',
      'move'
    )
    await createProjectResource(project.path, 'folder', 'src/CustomActors', 'Archive')
    const movedActorScript = await transferProjectResource(
      project.path,
      'script',
      actorScript.resourcePath,
      'src/CustomActors/Archive',
      'move'
    )

    const reloadedScene = (await loadProjectAssetFile(project.path, scene.resourcePath))
      .document as SceneAssetDocument
    const reloadedTilemap = await loadProjectAssetFile(
      project.path,
      `${renamedMapsFolder.resourcePath}/Room${PROJECT_ASSET_EXTENSIONS.tilemap}`
    )
    const reloadedActor = (await loadProjectAssetFile(project.path, movedActor.resourcePath))
      .document as ActorAssetDocument

    expect(reloadedScene.tilemapPath).toBe(
      `${renamedMapsFolder.resourcePath}/Room${PROJECT_ASSET_EXTENSIONS.tilemap}`
    )
    expect(reloadedScene.scriptPath).toBe(sceneScript.resourcePath)
    expect(reloadedScene.scriptProperties?.background).toBe(
      `${renamedMapsFolder.resourcePath}/Room${PROJECT_ASSET_EXTENSIONS.tilemap}`
    )
    expect(reloadedTilemap.document).toMatchObject({
      tilesetPath: renamedTileset.resourcePath
    })
    expect(reloadedScene.nodes[0]).toMatchObject({
      type: 'actor',
      resourcePath: movedActor.resourcePath,
      spritePath: `${movedSpritesFolder.resourcePath}/HeroSprite${PROJECT_ASSET_EXTENSIONS.sprite}`,
      scriptPath: movedActorScript.resourcePath,
      scriptProperties: {
        idle_animation: `${movedSpritesFolder.resourcePath}/HeroSprite${PROJECT_ASSET_EXTENSIONS.sprite}`
      }
    })
    expect(reloadedActor.root).toMatchObject({
      spritePath: `${movedSpritesFolder.resourcePath}/HeroSprite${PROJECT_ASSET_EXTENSIONS.sprite}`,
      scriptPath: movedActorScript.resourcePath
    })
    expect(reloadedScene.nodes[0].children[0]).toMatchObject({
      callbacks: [{ scriptPath: movedActorScript.resourcePath, functionName: 'OnEnter' }],
      exitCallbacks: [{ scriptPath: movedActorScript.resourcePath, functionName: 'OnExit' }]
    })
  })

  it('clears asset references when referenced resources are deleted', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Tilesets')
    await createProjectResource(project.path, 'folder', '', 'Maps')
    await createProjectResource(project.path, 'folder', '', 'Scenes')
    await createProjectResource(project.path, 'folder', '', 'Sprites')

    const tileset = await createProjectResource(project.path, 'tileset', 'Tilesets', 'Main')
    const tilemap = await createProjectResource(project.path, 'tilemap', 'Maps', 'Room')
    const scene = await createProjectResource(project.path, 'scene', 'Scenes', 'Intro')
    const sprite = await createProjectResource(project.path, 'sprite', 'Sprites', 'HeroSprite')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'HeroLogic')

    const tilemapPayload = await loadProjectAssetFile(project.path, tilemap.resourcePath)
    await saveProjectAssetFile(project.path, tilemap.resourcePath, {
      ...tilemapPayload.document,
      tilesetPath: tileset.resourcePath
    })

    const scenePayload = await loadProjectAssetFile(project.path, scene.resourcePath)
    await saveProjectAssetFile(project.path, scene.resourcePath, {
      ...scenePayload.document,
      tilemapPath: tilemap.resourcePath,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: sprite.resourcePath,
          scriptPath: actorScript.resourcePath,
          scriptProperties: {
            idle_animation: sprite.resourcePath
          },
          x: 0,
          y: 0,
          physicsMode: 'balanced',
          followCamera: false,
          children: [
            {
              id: 'hero-hitbox',
              type: 'collision',
              name: 'Hitbox',
              isCollapsed: false,
              x: 0,
              y: 0,
              width: 8,
              height: 8,
              isBlocking: true,
              callbacks: [{ scriptPath: actorScript.resourcePath, functionName: 'OnEnter' }],
              exitCallbacks: [{ scriptPath: actorScript.resourcePath, functionName: 'OnExit' }],
              children: []
            }
          ]
        }
      ]
    } as SceneAssetDocument)

    await deleteProjectResource(project.path, 'tileset', tileset.resourcePath)
    await deleteProjectResource(project.path, 'sprite', sprite.resourcePath)
    await deleteProjectResource(project.path, 'script', actorScript.resourcePath)

    const reloadedTilemap = await loadProjectAssetFile(project.path, tilemap.resourcePath)
    const reloadedScene = (await loadProjectAssetFile(project.path, scene.resourcePath))
      .document as SceneAssetDocument

    expect(reloadedTilemap.document).toMatchObject({
      tilesetPath: null
    })
    expect(reloadedScene.tilemapPath).toBe(tilemap.resourcePath)
    expect(reloadedScene.nodes[0]).toMatchObject({
      type: 'actor',
      spritePath: null,
      scriptProperties: {
        idle_animation: null
      }
    })
    expect(reloadedScene.nodes[0]).not.toHaveProperty('scriptPath')
    expect(reloadedScene.nodes[0].children[0]).toMatchObject({
      callbacks: [],
      exitCallbacks: []
    })
  })

  it('stores and restores bank overrides for bankable resources', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')

    await updateProjectResourceBank(project.path, 'sprite', sprite.resourcePath, 42)

    const rootView = await listProjectResources(project.path)
    expect(rootView.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: sprite.resourcePath,
          bank: 42
        })
      ])
    )

    const deletedSprite = await deleteProjectResource(project.path, 'sprite', sprite.resourcePath)
    await restoreDeletedProjectResource(project.path, deletedSprite.deletionId)

    const restoredView = await listProjectResources(project.path)
    expect(restoredView.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: sprite.resourcePath,
          bank: 42
        })
      ])
    )
  })

  it('tracks the selected starting scene across rename, delete, and restore operations', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const scene = await createProjectResource(project.path, 'scene', '', 'Intro')

    await updateProjectStartingScene(project.path, scene.resourcePath)

    const initialView = await listProjectResources(project.path)
    expect(initialView.startingScenePath).toBe(scene.resourcePath)

    const renamedScene = await renameProjectResource(
      project.path,
      'scene',
      scene.resourcePath,
      'Opening'
    )
    expect(renamedScene.view.startingScenePath).toBe(renamedScene.resourcePath)

    const deletedScene = await deleteProjectResource(
      project.path,
      'scene',
      renamedScene.resourcePath
    )
    expect(deletedScene.view.startingScenePath).toBeNull()

    const restoredScene = await restoreDeletedProjectResource(project.path, deletedScene.deletionId)
    expect(restoredScene.view.startingScenePath).toBe(restoredScene.resourcePath)
  })

  it('migrates legacy folder-only project metadata into tracked resource items', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await mkdir(join(project.path, 'Sprites'), { recursive: true })
    await writeFile(
      join(project.path, 'Sprites', `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )
    await writeFile(
      join(project.path, 'MyProject.json'),
      JSON.stringify(
        {
          name: 'MyProject',
          createdAt: new Date().toISOString(),
          resources: {
            folders: [
              {
                id: 'folder-1',
                name: 'Sprites',
                path: 'Sprites',
                parentPath: null,
                createdAt: '2026-03-27T10:00:00.000Z',
                updatedAt: '2026-03-27T10:00:00.000Z'
              }
            ]
          }
        },
        null,
        2
      ),
      'utf-8'
    )

    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')
    const migratedProjectFile = JSON.parse(
      await readFile(join(project.path, 'MyProject.json'), 'utf-8')
    ) as {
      resources: {
        items: Array<{ path: string; type: string }>
      }
    }

    expect(rootView.items.map((item) => item.name)).toEqual(['Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero'])
    expect(migratedProjectFile.resources.items.map((item) => [item.type, item.path])).toEqual([
      ['folder', 'Sprites'],
      ['file', `Sprites/Hero${PROJECT_ASSET_EXTENSIONS.sprite}`]
    ])
  })

  it('removes tracked assets from metadata when the file is missing on disk', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'sprite', '', 'Hero')
    await rm(join(project.path, `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`), { force: true })

    await expect(
      ensureProjectAssetFileAvailable(project.path, `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`)
    ).rejects.toThrow('The asset "Hero" could not be found, so it was removed from the project.')

    const rootView = await listProjectResources(project.path)
    expect(rootView.items).toEqual([])
  })

  it('rejects unsupported and untracked asset file selections before loading', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await writeFile(
      join(project.path, `Loose${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )

    await expect(loadProjectAssetFile(project.path, 'notes.txt')).rejects.toMatchObject({
      userMessage: 'The selected file is not a supported asset.'
    })
    await expect(
      loadProjectAssetFile(project.path, `Loose${PROJECT_ASSET_EXTENSIONS.sprite}`)
    ).rejects.toMatchObject({
      userMessage: 'The selected asset is not tracked in this project.'
    })
  })

  it('removes a tracked asset when its resource path points at a directory', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')

    await rm(join(project.path, sprite.resourcePath), { force: true })
    await mkdir(join(project.path, sprite.resourcePath), { recursive: true })

    await expect(
      ensureProjectAssetFileAvailable(project.path, sprite.resourcePath)
    ).rejects.toMatchObject({
      userMessage: 'The asset "Hero" could not be found, so it was removed from the project.'
    })
    await expect(listProjectResources(project.path)).resolves.toMatchObject({ items: [] })
  })

  it('rejects asset document kind mismatches while loading and saving tracked assets', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')

    await writeFile(
      join(project.path, sprite.resourcePath),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('tilemap')),
      'utf-8'
    )

    await expect(loadProjectAssetFile(project.path, sprite.resourcePath)).rejects.toMatchObject({
      userMessage: 'The asset file type does not match its extension.'
    })
    await expect(
      saveProjectAssetFile(
        project.path,
        sprite.resourcePath,
        createDefaultProjectAssetDocument('tilemap')
      )
    ).rejects.toMatchObject({
      userMessage: 'The asset data does not match the target file type.'
    })
  })

  it('returns a friendly error when loading an asset with invalid JSON syntax', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')

    await writeFile(join(project.path, sprite.resourcePath), '{ "kind": "sprite", ', 'utf-8')

    await expect(loadProjectAssetFile(project.path, sprite.resourcePath)).rejects.toThrow(
      'The asset "Hero" has invalid JSON and could not be loaded.'
    )
  })

  it('returns a friendly error when loading an asset with invalid document data', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprite = await createProjectResource(project.path, 'sprite', '', 'Hero')

    await writeFile(
      join(project.path, sprite.resourcePath),
      JSON.stringify({ kind: 'sprite', version: 1 }, null, 2),
      'utf-8'
    )

    await expect(loadProjectAssetFile(project.path, sprite.resourcePath)).rejects.toThrow(
      'The asset "Hero" has invalid data and could not be loaded.'
    )
  })

  it('removes missing tracked folders when opening them', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'sprite', 'Sprites', 'Hero')
    await rm(join(project.path, 'Sprites'), { recursive: true, force: true })

    await expect(listProjectResources(project.path, 'Sprites')).rejects.toThrow(
      'The folder "Sprites" could not be found, so it was removed from the project.'
    )

    const rootView = await listProjectResources(project.path)
    expect(rootView.items).toEqual([])
  })

  it('scans the project directory, tracks untracked resources, and removes missing tracked items', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Audio')
    await createProjectResource(project.path, 'sprite', '', 'Old Hero')
    await rm(join(project.path, 'Audio'), { recursive: true, force: true })
    await rm(join(project.path, `Old Hero${PROJECT_ASSET_EXTENSIONS.sprite}`), { force: true })

    await mkdir(join(project.path, 'Sprites'), { recursive: true })
    await writeFile(
      join(project.path, 'Sprites', `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )
    await writeFile(
      join(project.path, 'Sprites', 'broken.rgbsprite.json'),
      '{ not valid json',
      'utf-8'
    )

    const scanResult = await scanProjectDirectory(project.path)
    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')

    expect(scanResult.trackedCount).toBe(2)
    expect(scanResult.removedCount).toBe(2)
    expect(rootView.items.map((item) => item.name)).toEqual(['Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero'])
  })

  it('returns an empty scan result when tracked folders, assets, and scripts are already valid', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'sprite', 'Sprites', 'Hero')
    await createProjectScriptResource(project.path, 'general', 'Shared')

    await expect(scanProjectDirectory(project.path)).resolves.toEqual({
      trackedCount: 0,
      removedCount: 0
    })
  })

  it('skips internal and managed root entries while scanning untracked project files', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await mkdir(join(project.path, '.retrogbfull-history'), { recursive: true })
    await mkdir(join(project.path, 'obj'), { recursive: true })
    await mkdir(join(project.path, 'Sprites'), { recursive: true })
    await writeFile(
      join(project.path, '.retrogbfull-history', `Ignored${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )
    await writeFile(
      join(project.path, 'Sprites', `Hero${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )
    await writeFile(
      join(project.path, 'Sprites', `WrongType${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('tilemap')),
      'utf-8'
    )
    await writeFile(
      join(project.path, 'obj', `Ignored${PROJECT_ASSET_EXTENSIONS.sprite}`),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument('sprite')),
      'utf-8'
    )

    const scanResult = await scanProjectDirectory(project.path)
    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')

    expect(scanResult).toEqual({ trackedCount: 2, removedCount: 0 })
    expect(rootView.items.map((item) => item.name)).toEqual(['Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero'])
  })

  it('removes missing resource subtrees, missing script files, and stale starting scenes during scans', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const sprites = await createProjectResource(project.path, 'folder', '', 'Sprites')
    await createProjectResource(project.path, 'sprite', sprites.resourcePath, 'Hero')
    const scene = await createProjectResource(project.path, 'scene', '', 'Opening')
    const script = await createProjectScriptResource(project.path, 'actor', 'HeroActor')

    await updateProjectStartingScene(project.path, scene.resourcePath)
    await rm(join(project.path, 'Sprites'), { recursive: true, force: true })
    await rm(join(project.path, scene.resourcePath), { force: true })
    await rm(join(project.path, script.resourcePath.replace(/\.c$/i, '.h')), { force: true })

    const scanResult = await scanProjectDirectory(project.path)
    const rootView = await listProjectResources(project.path)
    const projectFileContents = JSON.parse(
      await readFile(join(project.path, 'MyProject.json'), 'utf-8')
    ) as {
      startingScenePath: string | null
    }

    expect(scanResult).toEqual({ trackedCount: 0, removedCount: 4 })
    expect(rootView.items.map((item) => item.name)).not.toContain('Sprites')
    expect(rootView.items.map((item) => item.name)).not.toContain('Opening')
    expect(projectFileContents.startingScenePath).toBeNull()
  })
})

const createTempWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-resources-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}
