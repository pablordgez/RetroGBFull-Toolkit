import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectStructure } from '../../src/main/projectLauncher'
import {
  ensureProjectAssetFileAvailable,
  loadProjectAssetFile,
  saveProjectAssetFile
} from '../../src/main/projectAssetFiles'
import {
  createProjectFolder,
  createProjectResource,
  deleteProjectResource,
  deleteProjectFolder,
  finalizeDeletedProjectResource,
  listProjectResources,
  renameProjectResource,
  renameProjectFolder,
  restoreDeletedProjectResource,
  scanProjectDirectory,
  transferProjectResource
} from '../../src/main/projectResources'
import {
  PROJECT_ASSET_EXTENSIONS,
  ProjectAssetKind,
  createDefaultProjectAssetDocument,
  serializeProjectAssetDocument
} from '../../src/shared/projectAssets'

const tempDirectories: string[] = []

describe('project resource helpers', () => {
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
    expect(renamedFolder.view.items.some((item) => item.type === 'folder' && item.name === 'Audio')).toBe(true)
    expect(deletedFolder.view.items).toEqual([])
    expect(projectFileContents.resources.items).toEqual([])
  })

  it('supports generic resource create, rename, delete, restore, and finalize operations for folders', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const createdFolder = await createProjectResource(project.path, 'folder', '', 'Scripts')
    const renamedFolder = await renameProjectResource(project.path, 'folder', createdFolder.resourcePath, 'Logic')
    const deletedFolder = await deleteProjectResource(project.path, 'folder', renamedFolder.resourcePath)
    const restoredFolder = await restoreDeletedProjectResource(project.path, deletedFolder.deletionId)
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
    const assetKinds: ProjectAssetKind[] = ['sprite', 'tileset', 'tilemap']

    for (const assetKind of assetKinds) {
      const createdAsset = await createProjectResource(project.path, assetKind, '', `Demo ${assetKind}`)
      const createdFilePath = join(project.path, `Demo ${assetKind}${PROJECT_ASSET_EXTENSIONS[assetKind]}`)
      const createdFile = await readFile(createdFilePath, 'utf-8')

      expect(createdAsset.resourceType).toBe(assetKind)
      expect(createdAsset.resourceName).toBe(`Demo ${assetKind}`)
      expect(createdAsset.resourcePath).toBe(`Demo ${assetKind}${PROJECT_ASSET_EXTENSIONS[assetKind]}`)
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
      ['file', 'Demo sprite', 'sprite'],
      ['file', 'Demo tilemap', 'tilemap'],
      ['file', 'Demo tileset', 'tileset']
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

    expect(copiedAsset.resourcePath).toBe(`Sprites/Hero${PROJECT_ASSET_EXTENSIONS.sprite}`)
    expect(duplicateAsset.resourcePath).toBe(`Sprites/Hero 2${PROJECT_ASSET_EXTENSIONS.sprite}`)
    expect(movedAsset.resourcePath).toBe(`Archive/Hero${PROJECT_ASSET_EXTENSIONS.sprite}`)

    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')
    const archiveView = await listProjectResources(project.path, 'Archive')

    expect(rootView.items.map((item) => item.name)).toEqual(['Archive', 'Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero', 'Hero 2'])
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
    await writeFile(join(project.path, 'Sprites', 'broken.rgbsprite.json'), '{ not valid json', 'utf-8')

    const scanResult = await scanProjectDirectory(project.path)
    const rootView = await listProjectResources(project.path)
    const spritesView = await listProjectResources(project.path, 'Sprites')

    expect(scanResult.trackedCount).toBe(2)
    expect(scanResult.removedCount).toBe(2)
    expect(rootView.items.map((item) => item.name)).toEqual(['Sprites'])
    expect(spritesView.items.map((item) => item.name)).toEqual(['Hero'])
  })
})

const createTempWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-resources-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}
