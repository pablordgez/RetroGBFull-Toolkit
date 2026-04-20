import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectStructure } from '../../src/main/projectLauncher'
import {
  loadProjectSaveDataState,
  loadProjectStartingScenePath,
  readProjectTrackedResourceBank,
  readProjectTrackedResourceBanks,
  saveProjectSaveDataState,
  saveProjectStartingScenePath
} from '../../src/main/projectMetadata'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../../src/shared/projectResourceModels'

const tempDirectories: string[] = []

describe('projectMetadata helpers', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('reads only tracked bankable resources and normalizes invalid banks to the default', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-metadata-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const projectFilePath = join(project.path, 'MyProject.json')
    const projectFile = JSON.parse(await readFile(projectFilePath, 'utf-8')) as {
      resources: {
        items: unknown[]
      }
    }

    projectFile.resources.items = [
      {
        type: 'file',
        path: ' sprites\\Hero.rgbsprite.json ',
        resourceType: 'sprite',
        bank: 7
      },
      {
        type: 'file',
        path: ' src\\Scripts\\Shared.c ',
        resourceType: 'script',
        scriptKind: 'general',
        bank: 23
      },
      {
        type: 'file',
        path: 'windows\\Hud.rgbwindow.json',
        resourceType: 'window',
        bank: 999
      },
      {
        type: 'file',
        path: 'Scenes\\Intro.rgbscene.json',
        resourceType: 'scene',
        bank: 42
      },
      {
        type: 'folder',
        path: 'Sprites'
      }
    ]

    await writeFile(projectFilePath, `${JSON.stringify(projectFile, null, 2)}\n`, 'utf-8')

    const banks = await readProjectTrackedResourceBanks(project.path)

    expect([...banks.entries()]).toEqual([
      ['sprites/Hero.rgbsprite.json', 7],
      ['src/Scripts/Shared.c', 23],
      ['windows/Hud.rgbwindow.json', DEFAULT_PROJECT_RESOURCE_BANK]
    ])
    expect(await readProjectTrackedResourceBank(project.path, 'Scenes/Intro.rgbscene.json')).toBe(
      DEFAULT_PROJECT_RESOURCE_BANK
    )
    expect(await readProjectTrackedResourceBank(project.path, 'windows\\Hud.rgbwindow.json')).toBe(
      DEFAULT_PROJECT_RESOURCE_BANK
    )
  })

  it('saves validated save-data state and reloads it from the project file', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-metadata-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const savedState = await saveProjectSaveDataState(project.path, {
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        },
        {
          id: 'lives',
          name: 'lives',
          type: 'uint8_t',
          defaultValue: '3'
        }
      ]
    })

    expect(savedState).toEqual({
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        },
        {
          id: 'lives',
          name: 'lives',
          type: 'uint8_t',
          defaultValue: '3'
        }
      ]
    })
    expect(await loadProjectSaveDataState(project.path)).toEqual(savedState)
  })

  it('rejects invalid save-data entries before persisting them', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-metadata-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await expect(
      saveProjectSaveDataState(project.path, {
        entries: [
          {
            id: 'reserved',
            name: 'signature',
            type: 'uint8_t',
            defaultValue: '0'
          }
        ]
      })
    ).rejects.toThrow('"signature" is reserved by the toolkit.')
  })

  it('normalizes the stored starting scene path and clears invalid values', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-metadata-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    expect(
      await saveProjectStartingScenePath(project.path, ' scenes\\Intro.rgbscene.json ')
    ).toBe('scenes/Intro.rgbscene.json')
    expect(await loadProjectStartingScenePath(project.path)).toBe('scenes/Intro.rgbscene.json')

    expect(await saveProjectStartingScenePath(project.path, 'src/Scripts/Shared.c')).toBeNull()
    expect(await loadProjectStartingScenePath(project.path)).toBeNull()
  })
})
