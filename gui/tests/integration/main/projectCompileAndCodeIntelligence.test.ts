import { EventEmitter } from 'events'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const projectBuildCodeMocks = vi.hoisted(() => ({
  buildProjectCode: vi.fn()
}))
const projectCodeSharedMocks = vi.hoisted(() => ({
  ensureProjectDirectory: vi.fn()
}))
const projectEngineBundleMocks = vi.hoisted(() => ({
  ensureBundledGbdkAvailableForProject: vi.fn()
}))
const projectMakeMocks = vi.hoisted(() => ({
  getMakeToolchainStatus: vi.fn()
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  const mockedModule = {
    ...actual,
    spawn: spawnMock
  }

  return {
    ...mockedModule,
    default: mockedModule
  }
})

vi.mock('../../../src/main/projectBuildCode', () => ({
  buildProjectCode: projectBuildCodeMocks.buildProjectCode
}))

vi.mock('../../../src/main/projectCodeShared', () => ({
  ensureProjectDirectory: projectCodeSharedMocks.ensureProjectDirectory
}))

vi.mock('../../../src/main/projectEngineBundle', () => ({
  ensureBundledGbdkAvailableForProject: projectEngineBundleMocks.ensureBundledGbdkAvailableForProject
}))

vi.mock('../../../src/main/projectMake', () => ({
  getMakeToolchainStatus: projectMakeMocks.getMakeToolchainStatus
}))

import { walkProjectCodeFiles } from '../../../src/main/projectCodeFiles'
import { getProjectCodeSymbolIndex } from '../../../src/main/projectCodeIntelligence'
import { buildAndCompileProject, compileProject } from '../../../src/main/projectCompile'

const tempDirectories: string[] = []

const createTempProject = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-compile-'))
  tempDirectories.push(workspaceDirectory)
  const projectPath = join(workspaceDirectory, 'Alpha')
  await mkdir(projectPath, { recursive: true })
  projectCodeSharedMocks.ensureProjectDirectory.mockImplementation(async (path: string) => path)
  return projectPath
}

const createChildProcess = (
  exitCode: number,
  stdoutChunks: string[] = [],
  stderrChunks: string[] = []
): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }

  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  queueMicrotask(() => {
    for (const chunk of stdoutChunks) {
      child.stdout.emit('data', Buffer.from(chunk))
    }

    for (const chunk of stderrChunks) {
      child.stderr.emit('data', Buffer.from(chunk))
    }

    child.emit('close', exitCode)
  })

  return child
}

const makeStatus = {
  installed: true,
  installPath: '/toolchains/make',
  executablePath: '/toolchains/make/bin/make',
  version: '4.4.1',
  source: 'runtime-managed' as const,
  message: 'GNU Make is available.'
}

describe('project compile and code intelligence integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectEngineBundleMocks.ensureBundledGbdkAvailableForProject.mockResolvedValue(undefined)
    projectMakeMocks.getMakeToolchainStatus.mockResolvedValue(makeStatus)
    projectBuildCodeMocks.buildProjectCode.mockResolvedValue({
      writtenFiles: ['src/main.c'],
      saveDataEntryCount: 0,
      spriteCount: 0,
      tilesetCount: 0,
      tilemapCount: 0,
      windowCount: 0,
      musicCount: 0,
      sceneCount: 0,
      actorScriptCount: 0,
      sceneScriptCount: 0
    })
  })

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('compiles with clean and build progress, streams command output, and returns the newest ROM', async () => {
    const projectPath = await createTempProject()
    await mkdir(join(projectPath, 'obj'), { recursive: true })
    await writeFile(join(projectPath, 'obj', 'old.gb'), 'old', 'utf-8')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await writeFile(join(projectPath, 'obj', 'Alpha.gb'), 'new', 'utf-8')
    const progress = vi.fn()

    spawnMock
      .mockImplementationOnce(() => createChildProcess(0, ['cleaning ', 'objects\nnext\n']))
      .mockImplementationOnce(() => createChildProcess(0, ['line 1\nline 2'], ['warning\n']))

    const result = await compileProject(projectPath, progress)

    expect(result).toEqual({
      romPath: 'obj/Alpha.gb',
      outputSummary: 'line 1\nline 2\nwarning'
    })
    expect(projectEngineBundleMocks.ensureBundledGbdkAvailableForProject).toHaveBeenCalledWith(
      projectPath
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      makeStatus.executablePath,
      ['clean'],
      expect.objectContaining({
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: expect.objectContaining({
          GBDK_HOME: join(projectPath, '..', 'gbdk')
        })
      })
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      makeStatus.executablePath,
      [],
      expect.objectContaining({ cwd: projectPath })
    )
    expect(progress).toHaveBeenCalledWith({
      projectPath,
      stage: 'clean',
      message: 'Running make clean...'
    })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'clean', message: 'cleaning objects' })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'clean', message: 'next' })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'compile', message: 'Running make...' })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'compile', message: 'line 1' })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'compile', message: 'line 2' })
    expect(progress).toHaveBeenCalledWith({ projectPath, stage: 'compile', message: 'warning' })
  })

  it('wraps missing Make and failed command output in launcher-friendly compile errors', async () => {
    const projectPath = await createTempProject()

    projectMakeMocks.getMakeToolchainStatus.mockResolvedValueOnce({
      ...makeStatus,
      installed: false
    })

    await expect(compileProject(projectPath)).rejects.toThrow(
      'GNU Make is not installed. Install it before compiling.'
    )
    expect(spawnMock).not.toHaveBeenCalled()

    projectMakeMocks.getMakeToolchainStatus.mockResolvedValueOnce(makeStatus)
    spawnMock.mockImplementationOnce(() =>
      createChildProcess(
        1,
        Array.from({ length: 14 }, (_, index) => `stdout ${index}\n`),
        ['stderr final\n']
      )
    )

    await expect(compileProject(projectPath)).rejects.toThrow(
      /Project compilation failed\.\nstdout 3/
    )
  })

  it('builds generated code before compiling when using the combined workflow', async () => {
    const projectPath = await createTempProject()
    const progress = vi.fn()
    spawnMock
      .mockImplementationOnce(() => createChildProcess(0))
      .mockImplementationOnce(() => createChildProcess(0, ['Build complete.\n']))

    const result = await buildAndCompileProject(projectPath, progress)

    expect(projectBuildCodeMocks.buildProjectCode).toHaveBeenCalledWith(projectPath, undefined)
    expect(result.buildResult.writtenFiles).toEqual(['src/main.c'])
    expect(result.compileResult).toEqual({
      romPath: null,
      outputSummary: 'Build complete.'
    })
    expect(progress).toHaveBeenCalledWith({
      projectPath,
      stage: 'build',
      message: 'Generating project code...'
    })
  })

  it('walks project C and header files recursively while skipping deleted resources', async () => {
    const projectPath = await createTempProject()
    await mkdir(join(projectPath, 'src', 'engine'), { recursive: true })
    await mkdir(join(projectPath, 'src', '.deleted'), { recursive: true })
    await writeFile(join(projectPath, 'src', 'main.c'), 'void main(void) {}\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'main.h'), '#pragma once\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'engine', 'scene.C'), 'void scene(void) {}\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'engine', 'notes.txt'), 'ignore', 'utf-8')
    await writeFile(join(projectPath, 'src', '.deleted', 'hidden.c'), 'ignore', 'utf-8')

    const files = await walkProjectCodeFiles(join(projectPath, 'src'))

    expect(files.map((file) => file.replace(/\\/g, '/')).sort()).toEqual([
      'engine/scene.C',
      'main.c',
      'main.h'
    ])
  })

  it('indexes project source symbols and returns an empty index when the source tree is missing', async () => {
    const projectPath = await createTempProject()
    await mkdir(join(projectPath, 'src', 'engine'), { recursive: true })
    await writeFile(
      join(projectPath, 'src', 'engine', 'types.h'),
      `
        #define HERO_SPEED 2
        typedef unsigned char UBYTE_ALIAS;
        typedef struct HeroState {
          unsigned char health;
          const char *name;
        } HeroState;
        typedef enum HeroMode { HERO_IDLE, HERO_RUN } HeroMode;
        extern HeroState *activeHero;
      `,
      'utf-8'
    )
    await writeFile(
      join(projectPath, 'src', 'main.c'),
      `
        #include "engine/types.h"
        void updateHero(HeroState *hero, unsigned char frame) BANKED {
          return;
        }
      `,
      'utf-8'
    )

    const index = await getProjectCodeSymbolIndex(projectPath)

    expect(index.sourceFilesScanned).toBe(2)
    expect(index.macros).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'HERO_SPEED', declaredIn: 'src/engine/types.h' })])
    )
    expect(index.typeAliases).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'UBYTE_ALIAS', declaredIn: 'src/engine/types.h' })])
    )
    expect(index.structs).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'HeroState', declaredIn: 'src/engine/types.h' })])
    )
    expect(index.enums).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'HeroMode', declaredIn: 'src/engine/types.h' })])
    )
    expect(index.variables).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'activeHero', declaredIn: 'src/engine/types.h' })])
    )
    expect(index.functions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'updateHero', declaredIn: 'src/main.c' })])
    )

    const emptyProjectPath = await createTempProject()
    await expect(getProjectCodeSymbolIndex(emptyProjectPath)).resolves.toMatchObject({
      sourceFilesScanned: 0,
      structs: [],
      enums: [],
      functions: [],
      variables: [],
      macros: [],
      typeAliases: []
    })
  })
})
