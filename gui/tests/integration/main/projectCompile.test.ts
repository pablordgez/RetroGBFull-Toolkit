import { chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAndCompileProject, compileProject } from '../../../src/main/projectCompile'

const originalBundledGbdkPath = process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
const originalBundledMakePath = process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
const originalMakeMode = process.env['RETROGBFULL_TEST_MAKE_MODE']
const originalPath = process.env['PATH']
const tempDirectories: string[] = []

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

interface TempProject {
  projectPath: string
  workspaceDirectory: string
}

const writeProjectJson = async (projectPath: string): Promise<void> => {
  const projectName = basename(projectPath)
  await writeFile(
    join(projectPath, `${projectName}.json`),
    `${JSON.stringify(
      {
        name: projectName,
        createdAt: '2026-01-01T00:00:00.000Z',
        startingScenePath: null,
        tags: { entries: [] },
        saveData: { entries: [] },
        resources: { items: [] }
      },
      null,
      2
    )}\n`,
    'utf-8'
  )
}

const makeScriptContents = (): string => {
  if (process.platform === 'win32') {
    return [
      '@echo off',
      'if "%1"=="--version" (',
      '  echo GNU Make 4.4.1',
      '  exit /b 0',
      ')',
      'if "%RETROGBFULL_TEST_MAKE_MODE%"=="fail" (',
      '  for /L %%i in (0,1,13) do echo stdout %%i',
      '  echo stderr final 1>&2',
      '  exit /b 1',
      ')',
      'if "%1"=="clean" (',
      '  echo cleaning objects',
      '  echo next',
      '  exit /b 0',
      ')',
      'echo line 1',
      'echo line 2',
      'echo warning 1>&2',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then',
    '  echo "GNU Make 4.4.1"',
    '  exit 0',
    'fi',
    'if [ "$RETROGBFULL_TEST_MAKE_MODE" = "fail" ]; then',
    '  i=0',
    '  while [ "$i" -le 13 ]; do',
    '    echo "stdout $i"',
    '    i=$((i + 1))',
    '  done',
    '  echo "stderr final" >&2',
    '  exit 1',
    'fi',
    'if [ "$1" = "clean" ]; then',
    '  echo "cleaning objects"',
    '  echo "next"',
    '  exit 0',
    'fi',
    'echo "line 1"',
    'echo "line 2"',
    'echo "warning" >&2',
    'exit 0',
    ''
  ].join('\n')
}

const prepareToolchainFixtures = async (workspaceDirectory: string): Promise<void> => {
  const bundledGbdkPath = join(workspaceDirectory, 'fixture-gbdk')
  const bundledMakePath = join(workspaceDirectory, 'fixture-make')
  const makeBinPath = join(bundledMakePath, 'bin')
  const makeExecutableName = process.platform === 'win32' ? 'make.cmd' : 'make'
  const makeExecutablePath = join(makeBinPath, makeExecutableName)

  await mkdir(join(bundledGbdkPath, 'bin'), { recursive: true })
  await writeFile(join(bundledGbdkPath, 'bin', 'lcc'), '', 'utf-8')
  await mkdir(makeBinPath, { recursive: true })
  await writeFile(makeExecutablePath, makeScriptContents(), 'utf-8')

  if (process.platform !== 'win32') {
    await chmod(makeExecutablePath, 0o755)
  }

  process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = bundledGbdkPath
  process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] = bundledMakePath
}

const createTempProject = async (): Promise<TempProject> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-compile-'))
  tempDirectories.push(workspaceDirectory)
  await prepareToolchainFixtures(workspaceDirectory)

  const projectPath = join(workspaceDirectory, 'Alpha')
  await mkdir(projectPath, { recursive: true })
  await writeProjectJson(projectPath)

  return { projectPath, workspaceDirectory }
}

describe('projectCompile integration', () => {
  beforeEach(() => {
    delete process.env['RETROGBFULL_TEST_MAKE_MODE']
  })

  afterEach(async () => {
    restoreEnv('RETROGBFULL_BUNDLED_GBDK_PATH', originalBundledGbdkPath)
    restoreEnv('RETROGBFULL_BUNDLED_MAKE_PATH', originalBundledMakePath)
    restoreEnv('RETROGBFULL_TEST_MAKE_MODE', originalMakeMode)
    restoreEnv('PATH', originalPath)
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('compiles with real project and toolchain helpers, streams progress, and returns the newest ROM', async () => {
    const { projectPath } = await createTempProject()
    await mkdir(join(projectPath, 'obj'), { recursive: true })
    await writeFile(join(projectPath, 'obj', 'old.gb'), 'old', 'utf-8')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await writeFile(join(projectPath, 'obj', 'Alpha.gb'), 'new', 'utf-8')
    const progress: Array<{ stage: string; message: string }> = []

    const result = await compileProject(projectPath, (payload) => {
      progress.push(payload)
    })

    expect(result).toEqual({
      romPath: 'obj/Alpha.gb',
      outputSummary: 'line 1\nline 2\nwarning'
    })
    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'clean', message: 'Running make clean...' }),
        expect.objectContaining({ stage: 'clean', message: 'cleaning objects' }),
        expect.objectContaining({ stage: 'clean', message: 'next' }),
        expect.objectContaining({ stage: 'compile', message: 'Running make...' }),
        expect.objectContaining({ stage: 'compile', message: 'line 1' }),
        expect.objectContaining({ stage: 'compile', message: 'line 2' }),
        expect.objectContaining({ stage: 'compile', message: 'warning' })
      ])
    )
  })

  it('reports missing Make and failed command output through launcher-friendly errors', async () => {
    const { projectPath, workspaceDirectory } = await createTempProject()
    await rm(process.env['RETROGBFULL_BUNDLED_MAKE_PATH']!, { recursive: true, force: true })
    process.env['PATH'] = ''

    await expect(compileProject(projectPath)).rejects.toThrow(
      'GNU Make is not installed. Install it before compiling.'
    )

    await prepareToolchainFixtures(workspaceDirectory)
    process.env['RETROGBFULL_TEST_MAKE_MODE'] = 'fail'

    await expect(compileProject(projectPath)).rejects.toThrow(
      /Project compilation failed\.\nstdout 3/
    )
  })

  it('builds generated project code before compiling in the combined workflow', async () => {
    const { projectPath } = await createTempProject()
    const progress: Array<{ stage: string; message: string }> = []

    const result = await buildAndCompileProject(projectPath, (payload) => {
      progress.push(payload)
    })

    expect(result.buildResult).toEqual(
      expect.objectContaining({
        sceneCount: 0,
        spriteCount: 0,
        tilesetCount: 0,
        tilemapCount: 0,
        windowCount: 0,
        musicCount: 0
      })
    )
    expect(result.buildResult.writtenFiles).toEqual(expect.arrayContaining(['src/main.c']))
    expect(result.compileResult).toEqual({
      romPath: null,
      outputSummary: 'line 1\nline 2\nwarning'
    })
    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'build', message: 'Generating project code...' }),
        expect.objectContaining({ stage: 'clean', message: 'Running make clean...' }),
        expect.objectContaining({ stage: 'compile', message: 'Running make...' })
      ])
    )
  })
})
