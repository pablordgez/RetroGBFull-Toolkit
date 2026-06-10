import { shell } from 'electron'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStructure } from '../../../src/main/projectLauncher'
import {
  openProjectInFileExplorer,
  showProjectResourceInFileExplorer
} from '../../../src/main/projectFileExplorer'
import { createProjectResource } from '../../../src/main/projectResources'

const tempDirectories: string[] = []

describe('projectFileExplorer integration', () => {
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

  it('opens the project folder after validating the project directory', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await expect(openProjectInFileExplorer(project.path)).resolves.toBe(true)

    expect(shell.openPath).toHaveBeenCalledWith(project.path)
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('surfaces shell open failures when opening a folder resource', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const folder = await createProjectResource(project.path, 'folder', '', 'Sprites')
    vi.mocked(shell.openPath).mockResolvedValueOnce('Unable to open folder')

    await expect(showProjectResourceInFileExplorer(project.path, folder.resourcePath)).rejects.toThrow(
      'Unable to open folder'
    )

    expect(shell.openPath).toHaveBeenCalledWith(join(project.path, 'Sprites'))
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('rejects blank and untracked resource paths before touching the shell', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await expect(showProjectResourceInFileExplorer(project.path, '   ')).rejects.toMatchObject({
      userMessage: 'The selected resource could not be found.'
    })
    await expect(
      showProjectResourceInFileExplorer(project.path, 'Sprites/Missing.rgbsprite.json')
    ).rejects.toMatchObject({
      userMessage: 'The selected resource could not be found.'
    })

    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('rejects tracked folders and files when their on-disk type no longer matches', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')
    const folder = await createProjectResource(project.path, 'folder', '', 'Sprites')
    await rm(join(project.path, 'Sprites'), { recursive: true, force: true })
    await writeFile(join(project.path, 'Sprites'), 'not a directory', 'utf-8')

    await expect(showProjectResourceInFileExplorer(project.path, folder.resourcePath)).rejects.toMatchObject({
      userMessage: 'The selected resource could not be found.'
    })

    await rm(join(project.path, 'Sprites'), { force: true })
    await mkdir(join(project.path, 'Sprites'), { recursive: true })
    const sprite = await createProjectResource(project.path, 'sprite', 'Sprites', 'Hero')
    await rm(join(project.path, 'Sprites', 'Hero.rgbsprite.json'), { force: true })
    await mkdir(join(project.path, 'Sprites', 'Hero.rgbsprite.json'), { recursive: true })

    await expect(showProjectResourceInFileExplorer(project.path, sprite.resourcePath)).rejects.toMatchObject({
      userMessage: 'The selected resource could not be found.'
    })

    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })
})

const createTempWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-file-explorer-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}
