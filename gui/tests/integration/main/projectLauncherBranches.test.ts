import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const projectCodeMocks = vi.hoisted(() => ({
  copyBundledEngineCore: vi.fn()
}))

vi.mock('../../../src/main/projectCode', () => ({
  copyBundledEngineCore: projectCodeMocks.copyBundledEngineCore
}))
import {
  createProjectStructure,
  listRecentProjects,
  readRecentProjects,
  rememberRecentProject,
  validateProjectDirectory
} from '../../../src/main/projectLauncher'

const tempDirectories: string[] = []

const createWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-launcher-branches-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}

const createProjectJson = async (
  projectPath: string,
  contents: Record<string, unknown> = {
    name: 'Alpha',
    createdAt: '2024-01-01T00:00:00.000Z',
    startingScenePath: null,
    tags: { entries: [] },
    saveData: { entries: [] },
    resources: { items: [] }
  }
): Promise<void> => {
  await mkdir(projectPath, { recursive: true })
  await writeFile(
    join(projectPath, `${projectPath.split(/[\\/]/).at(-1)}.json`),
    `${JSON.stringify(contents, null, 2)}\n`,
    'utf-8'
  )
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('project launcher branch integration', () => {
  it('reports invalid project directory shapes before accepting modern and legacy project JSON', async () => {
    const workspace = await createWorkspace()
    const missingProjectPath = join(workspace, 'Missing')
    const filePath = join(workspace, 'FileProject')

    await writeFile(filePath, 'not a directory', 'utf-8')
    await expect(validateProjectDirectory(missingProjectPath)).resolves.toMatchObject({
      isValid: false,
      message: 'The selected folder does not exist.'
    })
    await expect(validateProjectDirectory(filePath)).resolves.toMatchObject({
      isValid: false,
      message: 'The selected path is not a project folder.'
    })

    const noJsonPath = join(workspace, 'NoJson')
    await mkdir(noJsonPath)
    await expect(validateProjectDirectory(noJsonPath)).resolves.toMatchObject({
      isValid: false,
      message: 'Expected "NoJson.json" inside the selected folder.'
    })

    const jsonDirectoryPath = join(workspace, 'JsonDirectory')
    await mkdir(join(jsonDirectoryPath, 'JsonDirectory.json'), { recursive: true })
    await expect(validateProjectDirectory(jsonDirectoryPath)).resolves.toMatchObject({
      isValid: false,
      message: 'Expected "JsonDirectory.json" inside the selected folder.'
    })

    const brokenJsonPath = join(workspace, 'Broken')
    await mkdir(brokenJsonPath)
    await writeFile(join(brokenJsonPath, 'Broken.json'), '{', 'utf-8')
    await expect(validateProjectDirectory(brokenJsonPath)).resolves.toMatchObject({
      isValid: false,
      message: 'The file "Broken.json" is not valid JSON. Fix it and try opening the project again.'
    })

    const invalidShapePath = join(workspace, 'InvalidShape')
    await createProjectJson(invalidShapePath, { name: '', createdAt: '2024', resources: {} })
    await expect(validateProjectDirectory(invalidShapePath)).resolves.toMatchObject({
      isValid: false,
      message: 'The file "InvalidShape.json" is not a valid project JSON file.'
    })

    const legacyPath = join(workspace, 'Legacy')
    await createProjectJson(legacyPath, {
      name: 'Legacy',
      createdAt: '2024-01-01T00:00:00.000Z',
      resources: { folders: [] }
    })
    await expect(validateProjectDirectory(legacyPath)).resolves.toMatchObject({
      isValid: true,
      name: 'Legacy'
    })

    const modernPath = join(workspace, 'Modern')
    await createProjectJson(modernPath)
    await expect(validateProjectDirectory(modernPath)).resolves.toMatchObject({
      isValid: true,
      name: 'Modern'
    })
  })

  it('handles recent-project stores, invalid remembered paths, and invalid project creation names', async () => {
    const workspace = await createWorkspace()
    const storePath = join(workspace, 'state', 'recent.json')
    const alphaPath = join(workspace, 'Alpha')
    const betaPath = join(workspace, 'Beta')

    await mkdir(join(workspace, 'state'), { recursive: true })
    await createProjectJson(alphaPath)
    await createProjectJson(betaPath, {
      name: 'Beta',
      createdAt: '2024-01-01T00:00:00.000Z',
      resources: { folders: [] }
    })

    await expect(readRecentProjects(join(workspace, 'missing.json'))).resolves.toEqual([])
    await writeFile(storePath, '{', 'utf-8')
    await expect(readRecentProjects(storePath)).resolves.toEqual([])
    await writeFile(storePath, JSON.stringify({ not: 'an array' }), 'utf-8')
    await expect(readRecentProjects(storePath)).resolves.toEqual([])
    await writeFile(
      storePath,
      JSON.stringify([
        { name: 'Alpha', path: alphaPath, lastOpenedAt: '2024-01-02T00:00:00.000Z' },
        { name: 'Malformed', path: alphaPath },
        { name: 'Missing', path: join(workspace, 'Missing'), lastOpenedAt: '2024-01-03T00:00:00.000Z' },
        { name: 'Beta', path: betaPath, lastOpenedAt: '2024-01-04T00:00:00.000Z' }
      ]),
      'utf-8'
    )

    await expect(listRecentProjects(storePath)).resolves.toEqual([
      expect.objectContaining({ name: 'Beta' }),
      expect.objectContaining({ name: 'Alpha' })
    ])
    expect(JSON.parse(await readFile(storePath, 'utf-8'))).toHaveLength(2)

    await expect(rememberRecentProject(storePath, join(workspace, 'Missing'))).rejects.toThrow(
      'The selected folder does not exist.'
    )
    await expect(rememberRecentProject(storePath, alphaPath)).resolves.toMatchObject({
      name: 'Alpha'
    })

    await expect(createProjectStructure(workspace, 'Bad/Name')).rejects.toThrow(
      'Please enter a valid project name.'
    )
    await expect(createProjectStructure(workspace, 'Created')).resolves.toMatchObject({
      name: 'Created'
    })
    await expect(stat(join(workspace, 'Created', 'Created.json'))).resolves.toMatchObject({})
  })
})
