import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectStructure } from '../../../src/main/projectLauncher'
import {
  cleanupBundledDirectoryInTarget,
  copyBundledDirectoryIntoTarget,
  ensureProjectDirectory,
  getBundledGbdkPath,
  getBundledGbdkSource,
  getBundledMakePath,
  getBundledMakeSource,
  walkRelativePaths
} from '../../../src/main/projectCodeShared'

const tempDirectories: string[] = []
const originalBundledGbdkPath = process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
const originalRuntimeGbdkPath = process.env['RETROGBFULL_RUNTIME_GBDK_PATH']
const originalBundledMakePath = process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
const originalRuntimeMakePath = process.env['RETROGBFULL_RUNTIME_MAKE_PATH']

describe('projectCodeShared integration', () => {
  afterEach(async () => {
    restoreEnvironmentVariable('RETROGBFULL_BUNDLED_GBDK_PATH', originalBundledGbdkPath)
    restoreEnvironmentVariable('RETROGBFULL_RUNTIME_GBDK_PATH', originalRuntimeGbdkPath)
    restoreEnvironmentVariable('RETROGBFULL_BUNDLED_MAKE_PATH', originalBundledMakePath)
    restoreEnvironmentVariable('RETROGBFULL_RUNTIME_MAKE_PATH', originalRuntimeMakePath)
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('walks bundled directory trees while skipping ignored root directories', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const sourceDirectory = join(workspaceDirectory, 'source')
    await prepareBundledDirectoryFixture(sourceDirectory)

    const paths = await walkRelativePaths(sourceDirectory, '', new Set(['docs', 'obj']))

    expect(paths).toEqual(
      expect.arrayContaining(['include', 'include/existing.h', 'src', 'src/main.c'])
    )
    expect(paths).not.toEqual(expect.arrayContaining(['docs', 'docs/package.json', 'obj']))
  })

  it('copies new bundled files, keeps existing target files, and ignores configured roots', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const sourceDirectory = join(workspaceDirectory, 'source')
    const targetDirectory = join(workspaceDirectory, 'target')
    await prepareBundledDirectoryFixture(sourceDirectory)
    await mkdir(join(targetDirectory, 'include'), { recursive: true })
    await writeFile(join(targetDirectory, 'include', 'existing.h'), '// user owned\n', 'utf-8')

    const result = await copyBundledDirectoryIntoTarget(
      sourceDirectory,
      targetDirectory,
      new Set(['docs', 'obj'])
    )

    expect(result.copiedPaths).toEqual(expect.arrayContaining(['src/main.c']))
    expect(result.skippedPaths).toEqual(expect.arrayContaining(['include/existing.h']))
    expect(await readFile(join(targetDirectory, 'src', 'main.c'), 'utf-8')).toBe('int main(void);\n')
    expect(await readFile(join(targetDirectory, 'include', 'existing.h'), 'utf-8')).toBe(
      '// user owned\n'
    )
    await expect(stat(join(targetDirectory, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(join(targetDirectory, 'obj'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans target files represented by bundled sources without deleting ignored roots', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const sourceDirectory = join(workspaceDirectory, 'source')
    const targetDirectory = join(workspaceDirectory, 'target')
    await prepareBundledDirectoryFixture(sourceDirectory)
    await mkdir(join(targetDirectory, 'src'), { recursive: true })
    await mkdir(join(targetDirectory, 'include'), { recursive: true })
    await mkdir(join(targetDirectory, 'docs'), { recursive: true })
    await writeFile(join(targetDirectory, 'src', 'main.c'), '// stale bundled file\n', 'utf-8')
    await writeFile(join(targetDirectory, 'include', 'existing.h'), '// stale header\n', 'utf-8')
    await writeFile(join(targetDirectory, 'docs', 'package.json'), '{"private":true}\n', 'utf-8')

    await cleanupBundledDirectoryInTarget(sourceDirectory, targetDirectory, new Set(['docs']))

    await expect(stat(join(targetDirectory, 'src', 'main.c'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(stat(join(targetDirectory, 'include', 'existing.h'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    expect(await readFile(join(targetDirectory, 'docs', 'package.json'), 'utf-8')).toBe(
      '{"private":true}\n'
    )
  })

  it('validates project directories before returning their resolved path', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    await expect(ensureProjectDirectory(project.path)).resolves.toBe(resolve(project.path))
    await expect(ensureProjectDirectory(join(workspaceDirectory, 'MissingProject'))).rejects.toMatchObject({
      userMessage: 'The selected folder does not exist.'
    })
  })

  it('selects bundled, runtime-managed, and development toolchain locations from environment state', async () => {
    const workspaceDirectory = await createTempWorkspace()
    const bundledGbdkPath = join(workspaceDirectory, 'bundled-gbdk')
    const runtimeGbdkPath = join(workspaceDirectory, 'runtime-gbdk')
    const bundledMakePath = join(workspaceDirectory, 'bundled-make')
    const runtimeMakePath = join(workspaceDirectory, 'runtime-make')

    delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
    delete process.env['RETROGBFULL_RUNTIME_GBDK_PATH']
    delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
    delete process.env['RETROGBFULL_RUNTIME_MAKE_PATH']
    expect(getBundledGbdkSource()).toBe('development-root')
    expect(getBundledGbdkPath()).toContain('gbdk')
    expect(getBundledMakeSource()).toBe('development-root')
    expect(getBundledMakePath()).toContain('make')

    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = runtimeGbdkPath
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = runtimeMakePath
    expect(getBundledGbdkSource()).toBe('runtime-managed')
    expect(getBundledGbdkPath()).toBe(runtimeGbdkPath)
    expect(getBundledMakeSource()).toBe('runtime-managed')
    expect(getBundledMakePath()).toBe(runtimeMakePath)

    process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = bundledGbdkPath
    process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] = bundledMakePath
    expect(getBundledGbdkSource()).toBe('override')
    expect(getBundledGbdkPath()).toBe(bundledGbdkPath)
    expect(getBundledMakeSource()).toBe('override')
    expect(getBundledMakePath()).toBe(bundledMakePath)
  })
})

const createTempWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-shared-'))
  tempDirectories.push(workspaceDirectory)
  return workspaceDirectory
}

const prepareBundledDirectoryFixture = async (sourceDirectory: string): Promise<void> => {
  await mkdir(join(sourceDirectory, 'docs'), { recursive: true })
  await mkdir(join(sourceDirectory, 'include'), { recursive: true })
  await mkdir(join(sourceDirectory, 'obj'), { recursive: true })
  await mkdir(join(sourceDirectory, 'src'), { recursive: true })
  await writeFile(join(sourceDirectory, 'docs', 'package.json'), '{"private":true}\n', 'utf-8')
  await writeFile(join(sourceDirectory, 'include', 'existing.h'), '#pragma once\n', 'utf-8')
  await writeFile(join(sourceDirectory, 'obj', 'main.o'), 'object\n', 'utf-8')
  await writeFile(join(sourceDirectory, 'src', 'main.c'), 'int main(void);\n', 'utf-8')
}

const restoreEnvironmentVariable = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
