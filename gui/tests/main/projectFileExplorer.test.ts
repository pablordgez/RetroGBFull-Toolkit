import { shell } from 'electron'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStructure } from '../../src/main/projectLauncher'
import { showProjectResourceInFileExplorer } from '../../src/main/projectFileExplorer'
import { createProjectResource } from '../../src/main/projectResources'

const tempDirectories: string[] = []

describe('projectFileExplorer helpers', () => {
  beforeEach(() => {
    vi.mocked(shell.openPath).mockClear()
    vi.mocked(shell.openPath).mockResolvedValue('')
    vi.mocked(shell.showItemInFolder).mockClear()
  })

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('opens tracked folders directly in the file explorer', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const folder = await createProjectResource(project.path, 'folder', '', 'Sprites')

    await showProjectResourceInFileExplorer(project.path, folder.resourcePath)

    expect(shell.openPath).toHaveBeenCalledWith(join(project.path, 'Sprites'))
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('reveals tracked files through the file manager selection flow', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    await createProjectResource(project.path, 'folder', '', 'Sprites')
    const sprite = await createProjectResource(project.path, 'sprite', 'Sprites', 'Hero')

    await showProjectResourceInFileExplorer(project.path, sprite.resourcePath)

    expect(shell.showItemInFolder).toHaveBeenCalledWith(
      join(project.path, 'Sprites', 'Hero.rgbsprite.json')
    )
    expect(shell.openPath).not.toHaveBeenCalled()
  })
})

const createTempWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-file-explorer-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}
