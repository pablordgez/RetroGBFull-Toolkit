import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseStoredResources,
  readProjectResourceState,
  writeProjectResources
} from '../../../src/main/projectResourceRepository'
import {
  getDeletedResourceContainerPath,
  readDeletedResourceMetadata,
  writeDeletedResourceMetadata
} from '../../../src/main/projectResourceDeletedStore'

const tempDirectories: string[] = []

const createTempProject = async (
  projectFile: Record<string, unknown> = {
    name: 'Alpha',
    createdAt: '2024-01-01T00:00:00.000Z',
    startingScenePath: null,
    resources: { items: [] }
  }
): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-repository-'))
  tempDirectories.push(workspaceDirectory)
  const projectPath = join(workspaceDirectory, 'Alpha')
  await mkdir(projectPath, { recursive: true })
  await writeFile(join(projectPath, 'Alpha.json'), `${JSON.stringify(projectFile, null, 2)}\n`, 'utf-8')
  return projectPath
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('project resource repository branch integration', () => {
  it('normalizes mixed stored resource records and rejects malformed entries', () => {
    const resources = parseStoredResources([
      null,
      { type: 'unknown', path: 'Ignored' },
      { type: 'folder', path: '', name: 'Missing Path' },
      { type: 'file', path: 'notes.txt' },
      { type: 'folder', path: 'Sprites/Hero Frames', parentPath: '../outside' },
      { type: 'file', path: 'Hero.rgbsprite.json', resourceType: 'sprite', bank: 12 },
      { type: 'file', path: 'Intro.rgbscene.json', resourceType: 'scene', bank: 10 },
      { type: 'file', path: 'src/CustomActors/Hero.c', resourceType: 'script' },
      { type: 'file', path: 'src/Scripts/boot.c', resourceType: 'script', scriptKind: 'general', bank: 255 },
      { type: 'file', path: 'src/CustomScenes/Intro.c', scriptKind: 'not-real' }
    ])

    expect(resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'folder',
          name: 'Hero Frames',
          path: 'Sprites/Hero Frames',
          parentPath: '../outside'
        }),
        expect.objectContaining({
          type: 'file',
          name: 'Hero',
          path: 'Hero.rgbsprite.json',
          resourceType: 'sprite',
          bank: 12
        }),
        expect.objectContaining({
          type: 'file',
          name: 'Intro',
          path: 'Intro.rgbscene.json',
          resourceType: 'scene',
          bank: null
        }),
        expect.objectContaining({
          type: 'file',
          name: 'Hero',
          path: 'src/CustomActors/Hero.c',
          resourceType: 'script',
          scriptKind: 'actor'
        }),
        expect.objectContaining({
          type: 'file',
          name: 'boot',
          path: 'src/Scripts/boot.c',
          resourceType: 'script',
          scriptKind: 'general',
          bank: 255
        }),
        expect.objectContaining({
          type: 'file',
          name: 'Intro',
          path: 'src/CustomScenes/Intro.c',
          resourceType: 'script',
          scriptKind: 'scene'
        })
      ])
    )
    expect(resources.some((resource) => resource.path === 'notes.txt')).toBe(false)
  })

  it('migrates legacy folder resources while skipping internal and managed engine entries', async () => {
    const projectPath = await createTempProject({
      name: 'Alpha',
      createdAt: '2024-01-01T00:00:00.000Z',
      startingScenePath: 'Scenes/Intro.rgbscene.json',
      resources: {
        folders: [
          {
            id: 'legacy-scenes',
            path: 'Scenes',
            name: '',
            parentPath: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z'
          },
          { path: '', name: 'Invalid Legacy Folder' },
          'not-a-record'
        ]
      }
    })
    await mkdir(join(projectPath, 'Scenes'), { recursive: true })
    await mkdir(join(projectPath, 'src'), { recursive: true })
    await mkdir(join(projectPath, '.retrogbfull-history'), { recursive: true })
    await writeFile(
      join(projectPath, 'Scenes', 'Intro.rgbscene.json'),
      JSON.stringify({ kind: 'scene', version: 1, nodes: [] }),
      'utf-8'
    )
    await writeFile(join(projectPath, 'Makefile'), 'all:\n', 'utf-8')
    await writeFile(join(projectPath, 'Notes.txt'), 'ignore me', 'utf-8')

    const state = await readProjectResourceState(projectPath)

    expect(state.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'folder',
          id: 'legacy-scenes',
          name: 'Scenes',
          path: 'Scenes',
          createdAt: '2024-01-01T00:00:00.000Z'
        }),
        expect.objectContaining({
          type: 'file',
          name: 'Intro',
          path: 'Scenes/Intro.rgbscene.json',
          resourceType: 'scene'
        })
      ])
    )
    expect(state.resources.some((resource) => resource.path === 'src')).toBe(false)
    expect(state.resources.some((resource) => resource.path === 'Makefile')).toBe(false)

    const migratedProjectFile = JSON.parse(await readFile(join(projectPath, 'Alpha.json'), 'utf-8'))
    expect(migratedProjectFile.resources.folders).toBeUndefined()
    expect(migratedProjectFile.startingScenePath).toBe('Scenes/Intro.rgbscene.json')
  })

  it('preserves explicit empty resource lists and omits default banks when writing resources', async () => {
    const projectPath = await createTempProject({
      name: 'Alpha',
      createdAt: '2024-01-01T00:00:00.000Z',
      startingScenePath: 'Missing.rgbscene.json',
      resources: {
        folders: [{ path: 'Legacy' }],
        items: []
      }
    })

    const state = await readProjectResourceState(projectPath)
    expect(state.resources).toEqual([])

    await writeProjectResources(state, [
      {
        type: 'file',
        id: 'sprite-1',
        name: 'Hero',
        path: 'Hero.rgbsprite.json',
        parentPath: null,
        resourceType: 'sprite',
        bank: 255,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        type: 'file',
        id: 'music-1',
        name: 'Theme',
        path: 'Theme.rgbmusic.json',
        parentPath: null,
        resourceType: 'music',
        bank: 7,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    ])

    const writtenProjectFile = JSON.parse(await readFile(join(projectPath, 'Alpha.json'), 'utf-8'))
    expect(writtenProjectFile.resources.folders).toBeUndefined()
    expect(writtenProjectFile.startingScenePath).toBe('Missing.rgbscene.json')
    expect(writtenProjectFile.resources.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'Hero.rgbsprite.json' }),
        expect.objectContaining({ path: 'Theme.rgbmusic.json', bank: 7 })
      ])
    )
    expect(
      writtenProjectFile.resources.items.find(
        (item: { path?: string }) => item.path === 'Hero.rgbsprite.json'
      )
    ).not.toHaveProperty('bank')
  })

  it('round-trips and falls back deleted resource metadata for assets, scripts, and invalid resource types', async () => {
    const projectPath = await createTempProject()

    await writeDeletedResourceMetadata(projectPath, {
      deletionId: 'delete-hero',
      resourceType: 'sprite',
      resourcePath: 'Hero.rgbsprite.json',
      resourceName: 'Hero',
      parentPath: '',
      startingScenePath: 'Hero.rgbsprite.json',
      scriptKind: null,
      resources: []
    })
    await writeDeletedResourceMetadata(projectPath, {
      deletionId: 'delete-script',
      resourceType: 'script',
      resourcePath: 'src/Scripts/boot.c',
      resourceName: '',
      parentPath: 'src/Scripts',
      scriptKind: 'general',
      resources: []
    })
    await mkdir(getDeletedResourceContainerPath(projectPath, 'delete-odd'), { recursive: true })
    await writeFile(
      join(getDeletedResourceContainerPath(projectPath, 'delete-odd'), 'metadata.json'),
      `${JSON.stringify({
        deletionId: 'delete-odd',
        resourceType: 'nonsense',
        resourcePath: 'OddThing',
        resourceName: '',
        parentPath: '',
        scriptKind: 'wrong',
        startingScenePath: '../outside',
        resources: [{ type: 'not-real' }]
      })}\n`,
      'utf-8'
    )

    await expect(readDeletedResourceMetadata(projectPath, 'missing')).rejects.toThrow()
    await mkdir(getDeletedResourceContainerPath(projectPath, 'broken'), { recursive: true })
    await writeFile(
      join(getDeletedResourceContainerPath(projectPath, 'broken'), 'metadata.json'),
      'null',
      'utf-8'
    )
    await expect(readDeletedResourceMetadata(projectPath, 'broken')).rejects.toThrow(
      'The deleted resource metadata is invalid.'
    )

    await expect(readDeletedResourceMetadata(projectPath, 'delete-hero')).resolves.toMatchObject({
      deletionId: 'delete-hero',
      resourceType: 'sprite',
      resourceName: 'Hero',
      resources: [expect.objectContaining({ resourceType: 'sprite' })]
    })
    await expect(readDeletedResourceMetadata(projectPath, 'delete-script')).resolves.toMatchObject({
      deletionId: 'delete-script',
      resourceName: 'boot.c',
      scriptKind: 'general',
      resources: [expect.objectContaining({ resourceType: 'script', scriptKind: 'general' })]
    })
    await expect(readDeletedResourceMetadata(projectPath, 'delete-odd')).resolves.toMatchObject({
      deletionId: 'delete-odd',
      resourceType: 'nonsense',
      resourceName: 'OddThing',
      startingScenePath: null,
      scriptKind: null,
      resources: [expect.objectContaining({ type: 'folder', path: 'OddThing' })]
    })
  })
})
