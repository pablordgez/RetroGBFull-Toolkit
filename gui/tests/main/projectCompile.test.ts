import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAndCompileProject } from '../../src/main/projectCode'
import { createProjectStructure } from '../../src/main/projectLauncher'

const tempDirectories: string[] = []
const originalPath = process.env['PATH']
const originalBundledGbdkPath = process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
const originalBundledMakePath = process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
const originalRuntimeMakePath = process.env['RETROGBFULL_RUNTIME_MAKE_PATH']

const createTempDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(join(tmpdir(), 'retrogb-compile-'))
  tempDirectories.push(directoryPath)
  return directoryPath
}

const createBundledGbdkFixture = async (workspacePath: string): Promise<void> => {
  const bundledGbdkPath = join(workspacePath, 'bundled-gbdk')
  await mkdir(join(bundledGbdkPath, 'bin'), { recursive: true })
  await writeFile(join(bundledGbdkPath, 'bin', process.platform === 'win32' ? 'lcc.exe' : 'lcc'), '', 'utf-8')
  process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = bundledGbdkPath
}

const createBundledMakeFixture = async (workspacePath: string): Promise<void> => {
  const bundledMakePath = join(workspacePath, 'bundled-make')
  const bundledMakeBinPath = join(bundledMakePath, 'bin')
  await mkdir(bundledMakeBinPath, { recursive: true })

  if (process.platform === 'win32') {
    await writeFile(
      join(bundledMakeBinPath, 'make.cmd'),
      [
        '@echo off',
        'if "%~1"=="--version" (',
        '  echo GNU Make 4.4.1',
        '  exit /b 0',
        ')',
        'if "%~1"=="clean" (',
        '  if exist obj rmdir /S /Q obj',
        '  echo cleaned',
        '  exit /b 0',
        ')',
        'if not exist obj mkdir obj',
        'echo compiled>obj\\Example.gb',
        'echo GBDK_HOME=%GBDK_HOME%',
        'exit /b 0',
        ''
      ].join('\r\n'),
      'utf-8'
    )
  } else {
    const makePath = join(bundledMakeBinPath, 'make')
    await writeFile(
      makePath,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  echo "GNU Make 4.4.1"',
        '  exit 0',
        'fi',
        'if [ "$1" = "clean" ]; then',
        '  rm -rf obj',
        '  printf "cleaned\\n"',
        '  exit 0',
        'fi',
        'mkdir -p obj',
        'printf compiled > obj/Example.gb',
        'printf "GBDK_HOME=%s\\n" "$GBDK_HOME"',
        ''
      ].join('\n'),
      'utf-8'
    )
    await chmod(makePath, 0o755)
  }

  process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] = bundledMakePath
  delete process.env['RETROGBFULL_RUNTIME_MAKE_PATH']
}

describe('projectCompile', () => {
  afterEach(async () => {
    if (originalPath === undefined) {
      delete process.env['PATH']
    } else {
      process.env['PATH'] = originalPath
    }

    if (originalBundledGbdkPath === undefined) {
      delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
    } else {
      process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = originalBundledGbdkPath
    }

    if (originalBundledMakePath === undefined) {
      delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
    } else {
      process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] = originalBundledMakePath
    }

    if (originalRuntimeMakePath === undefined) {
      delete process.env['RETROGBFULL_RUNTIME_MAKE_PATH']
    } else {
      process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = originalRuntimeMakePath
    }

    await Promise.all(
      tempDirectories.splice(0).map((directoryPath) =>
        rm(directoryPath, { recursive: true, force: true })
      )
    )
  })

  it('builds project code and compiles the ROM with GNU Make', async () => {
    const workspacePath = await createTempDirectory()
    process.env['PATH'] = ''
    await createBundledGbdkFixture(workspacePath)
    await createBundledMakeFixture(workspacePath)

    const project = await createProjectStructure(workspacePath, 'CompileProject')
    const result = await buildAndCompileProject(project.path)
    const romPath = join(project.path, 'obj', 'Example.gb')

    expect(result.compileResult.romPath).toBe('obj/Example.gb')
    expect(result.compileResult.outputSummary).toContain('GBDK_HOME=')
    expect(result.buildResult.writtenFiles.length).toBeGreaterThan(0)
    expect((await stat(romPath)).isFile()).toBe(true)
    expect(await readFile(romPath, 'utf-8')).toContain('compiled')
  })
})
